// enroll: adds one song's fingerprints to the flat-file database.
// Usage: ./enroll <wavPath> <songId> <fingerprintsDbPath>
//
// It knows nothing about song names -- that metadata is managed entirely
// by the Express server in songs.json. This tool only ever deals with
// numeric song IDs and audio, which keeps it small and easy to reason about.
#include "engine.h"
#include <iostream>

int main(int argc, char** argv) {
    // Needs 3 arguments: wav path, song id, database path
    if (argc < 4) {
        std::cerr << "Usage: enroll <wavPath> <songId> <fingerprintsDbPath>\n";
        return 1;
    }

    std::string wavPath = argv[1];
    // Arguments are text, so convert the song id to an int
    int songId = std::stoi(argv[2]);
    std::string dbPath = argv[3];

    auto fps = compute_fingerprints(wavPath, songId);
    // No fingerprints means the file was unreadable or too short
    if (fps.empty()) {
        std::cout << R"({"status":"error","message":"no_fingerprints"})" << "\n";
        return 1;
    }

    // Save to the database file
    append_fingerprints(dbPath, fps);
    std::cout << R"({"status":"ok","songId":)" << songId
               << R"(,"numFingerprints":)" << fps.size() << "}\n";
    return 0;
}
