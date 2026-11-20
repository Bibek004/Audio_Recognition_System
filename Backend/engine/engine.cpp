#include "engine.h"
#include <sndfile.h>
#include <fftw3.h>
#include <cmath>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <iostream>

using namespace std;

namespace {
    // Tuning constants (comments assume 44.1 kHz audio). Samples per FFT frame, about 23 ms
    const int WINDOW_SIZE     = 1024;
    // Step between frames; 512 means each frame overlaps the previous one by half
    const int HOP_SIZE        = 512;
    // Loudest frequency bins kept per frame
    const int PEAKS_PER_FRAME = 5;
    // Skip the lowest frequency bins
    const int MIN_FREQ_BIN    = 10;
    // An anchor peak is paired with peaks 1 to 45 frames later
    const int FAN_MIN_DT      = 1;
    const int FAN_MAX_DT      = 45;
    // Maximum pairs per anchor peak
    const int FAN_MAX_TARGETS = 5;
}

// One peak: frame number, frequency bin, loudness in dB
struct Peak { int t; int f; float mag; };

// Packs two peak frequencies + their time delta into a single 64-bit hash.
// Layout: f1 (bits 31-22) | f2 (bits 21-12) | time gap (bits 11-0)
static uint64_t make_hash(uint16_t f1, uint16_t f2, uint16_t dt) {
    f1 &= 0x3FF; f2 &= 0x3FF; dt &= 0x0FFF;
    return (static_cast<uint64_t>(f1) << 22)
         | (static_cast<uint64_t>(f2) << 12)
         | static_cast<uint64_t>(dt);
}

// Step 1: read the WAV file into one array of samples
static bool load_audio_mono(const string& path, vector<double>& mono) {
    SF_INFO info{};
    SNDFILE* snd = sf_open(path.c_str(), SFM_READ, &info);
    if (!snd) { cerr << "Could not open WAV: " << path << "\n"; return false; }

    vector<double> buf(static_cast<size_t>(info.frames) * info.channels);
    sf_count_t got = sf_readf_double(snd, buf.data(), info.frames);
    sf_close(snd);
    if (got <= 0) return false;

    // Downmix to mono if the file has more than one channel.
    mono.resize(static_cast<size_t>(got));
    for (sf_count_t i = 0; i < got; ++i) {
        double sum = 0.0;
        for (int c = 0; c < info.channels; ++c) sum += buf[static_cast<size_t>(i) * info.channels + c];
        mono[i] = sum / info.channels;
    }
    return true;
}

// Hann window: fades the frame edges to zero so the FFT does not smear
static void hann_window(vector<double>& win) {
    int N = static_cast<int>(win.size());
    for (int i = 0; i < N; ++i) win[i] = 0.5 - 0.5 * cos(2.0 * M_PI * i / (N - 1));
}

// Step 2: spectrogram = FFT of every frame. spec[frame][bin] = loudness in dB
static void compute_spectrogram(const vector<double>& mono, vector<vector<float>>& spec) {
    if (mono.size() < static_cast<size_t>(WINDOW_SIZE)) { spec.clear(); return; }
    int numFrames = 1 + static_cast<int>((mono.size() - WINDOW_SIZE) / HOP_SIZE);
    spec.assign(numFrames, vector<float>(WINDOW_SIZE / 2, 0.0f));

    vector<double> window(WINDOW_SIZE, 0.0);
    hann_window(window);

    double* in = (double*) fftw_malloc(sizeof(double) * WINDOW_SIZE);
    fftw_complex* out = (fftw_complex*) fftw_malloc(sizeof(fftw_complex) * (WINDOW_SIZE / 2 + 1));
    fftw_plan plan = fftw_plan_dft_r2c_1d(WINDOW_SIZE, in, out, FFTW_ESTIMATE);

    // For each frame: apply the window, run the FFT, store the loudness
    for (int t = 0; t < numFrames; ++t) {
        size_t start = static_cast<size_t>(t) * HOP_SIZE;
        for (int i = 0; i < WINDOW_SIZE; ++i) in[i] = mono[start + i] * window[i];
        fftw_execute(plan);
        for (int k = 0; k < WINDOW_SIZE / 2; ++k) {
            double re = out[k][0], im = out[k][1];
            double mag = sqrt(re * re + im * im);
            // Convert to decibels
            spec[t][k] = static_cast<float>(20.0 * log10(mag + 1e-9));
        }
    }
    fftw_destroy_plan(plan);
    fftw_free(in);
    fftw_free(out);
}

// Step 3: keep only the loudest bins of each frame (the "peaks")
static void pick_peaks(const vector<vector<float>>& spec, vector<Peak>& peaks) {
    peaks.clear();
    if (spec.empty()) return;
    const int T = static_cast<int>(spec.size());
    const int F = static_cast<int>(spec[0].size());
    for (int t = 0; t < T; ++t) {
        vector<pair<float, int>> mags; mags.reserve(F);
        for (int f = MIN_FREQ_BIN; f < F; ++f) mags.emplace_back(spec[t][f], f);
        if ((int)mags.size() > PEAKS_PER_FRAME) {
            // Moves the 5 loudest to the front without sorting everything
            nth_element(mags.begin(), mags.begin() + PEAKS_PER_FRAME, mags.end(),
                        [](const auto& a, const auto& b) { return a.first > b.first; });
            mags.resize(PEAKS_PER_FRAME);
        }
        for (const auto& mf : mags) peaks.push_back(Peak{ t, mf.second, mf.first });
    }
    sort(peaks.begin(), peaks.end(), [](const Peak& a, const Peak& b) {
        if (a.t != b.t) return a.t < b.t;
        return a.f < b.f;
    });
}

// Step 4: pair each peak with later peaks and hash every pair
static void make_fingerprints(const vector<Peak>& peaks, vector<Fingerprint>& fps, int songId) {
    fps.clear();
    if (peaks.empty()) return;
    int maxT = 0;
    for (const auto& p : peaks) maxT = max(maxT, p.t);

    // Peaks grouped by frame number for quick lookup
    vector<vector<int>> byT(maxT + 1);
    for (int i = 0; i < (int)peaks.size(); ++i) byT[peaks[i].t].push_back(i);

    for (const auto& anchor : peaks) {
        int fanCount = 0;
        for (int dt = FAN_MIN_DT; dt <= FAN_MAX_DT && fanCount < FAN_MAX_TARGETS; ++dt) {
            int tt = anchor.t + dt;
            if (tt > maxT) break;
            for (int idx : byT[tt]) {
                const Peak& target = peaks[idx];
                uint64_t h = make_hash(static_cast<uint16_t>(anchor.f),
                                        static_cast<uint16_t>(target.f),
                                        static_cast<uint16_t>(dt));
                fps.push_back(Fingerprint{ h, songId, anchor.t });
                if (++fanCount >= FAN_MAX_TARGETS) break;
            }
        }
    }
}

// Runs steps 1 to 4 on one WAV file. Empty result means failure
vector<Fingerprint> compute_fingerprints(const string& wavPath, int songId) {
    vector<double> mono;
    if (!load_audio_mono(wavPath, mono)) return {};
    if (mono.size() < static_cast<size_t>(WINDOW_SIZE)) return {};

    vector<vector<float>> spec;
    compute_spectrogram(mono, spec);
    if (spec.empty()) return {};

    vector<Peak> peaks;
    pick_peaks(spec, peaks);
    if (peaks.empty()) return {};

    vector<Fingerprint> fps;
    make_fingerprints(peaks, fps, songId);
    return fps;
}

void append_fingerprints(const string& dbPath, const vector<Fingerprint>& fps) {
    ofstream out(dbPath, ios::app);
    for (const auto& fp : fps) {
        out << fp.hash << ' ' << fp.songId << ' ' << fp.offset << '\n';
    }
}

FingerprintDB load_fingerprint_db(const string& dbPath) {
    FingerprintDB db;
    ifstream in(dbPath);
    uint64_t hash; int songId, offset;
    while (in >> hash >> songId >> offset) {
        db[hash].emplace_back(songId, offset);
    }
    return db;
}

string match_fingerprints(const FingerprintDB& db, const vector<Fingerprint>& queryFps) {
    // votes[songId][timeOffsetDelta] = how many query hashes line up with
    // that song at that alignment. A real match produces one delta with a
    // big spike in votes; noise spreads votes thinly across many deltas.
    unordered_map<int, unordered_map<int, int>> votes;
    int bestSong = -1, bestCount = 0;

    for (const auto& q : queryFps) {
        auto it = db.find(q.hash);
        if (it == db.end()) continue;
        for (const auto& m : it->second) {
            int songId = m.first;
            int dbOffset = m.second;
            // Time shift between the song and the clip
            int delta = dbOffset - q.offset;
            // Vote for this (song, shift) pair. A real match gets many votes on one shift
            int c = ++votes[songId][delta];
            if (c > bestCount) { bestCount = c; bestSong = songId; }
        }
    }

    ostringstream oss;
    if (bestSong < 0) {
        return R"({"match":null,"score":0,"top":[]})";
    }

    // Rank songs by their best (highest-voted) alignment.
    vector<pair<int, int>> perSong; // (bestVoteCount, songId)
    for (auto& kv : votes) {
        int top = 0;
        for (auto& dv : kv.second) top = max(top, dv.second);
        perSong.emplace_back(top, kv.first);
    }
    sort(perSong.begin(), perSong.end(), greater<>());

    oss << R"({"match":)" << bestSong << R"(,"score":)" << bestCount << R"(,"top":[)";
    for (size_t i = 0; i < perSong.size() && i < 5; ++i) {
        if (i) oss << ",";
        oss << R"({"songId":)" << perSong[i].second << R"(,"score":)" << perSong[i].first << "}";
    }
    oss << "]}";
    return oss.str();
}
