#pragma once
#include <string>
#include <vector>
#include <cstdint>
#include <unordered_map>

// A single fingerprint: a hash derived from a pair of nearby spectral peaks,
// tagged with which song it came from and where in the song it occurs.
struct Fingerprint {
    uint64_t hash;
    int songId;
    int offset;
};

// hash -> list of (songId, offset) pairs that produced that hash.
using FingerprintDB = std::unordered_map<uint64_t, std::vector<std::pair<int, int>>>;

// Computes the fingerprints for a WAV file (FFT -> spectrogram -> peak
// picking -> combinatorial hashing). Pass songId = -1 for a query clip
// that isn't being stored.
std::vector<Fingerprint> compute_fingerprints(const std::string& wavPath, int songId);

// Appends fingerprints to the flat-file database (one "hash songId offset"
// per line). This is the whole "database" -- no server, no SQL.
void append_fingerprints(const std::string& dbPath, const std::vector<Fingerprint>& fps);

// Loads the entire flat-file database into memory.
FingerprintDB load_fingerprint_db(const std::string& dbPath);

// Matches query fingerprints against the loaded database and returns a
// hand-built JSON string: {"match":songId,"score":N,"top":[...]}
std::string match_fingerprints(const FingerprintDB& db, const std::vector<Fingerprint>& queryFps);
