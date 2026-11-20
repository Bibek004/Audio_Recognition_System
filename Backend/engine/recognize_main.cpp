// recognize: identifies a short clip against the fingerprint database.
// Usage: ./recognize <wavPath> <fingerprintsDbPath>
//
// Stateless by design: it loads the whole database fresh on every run and
// exits when it's done. No server process, no threads, no shared state --
// which means there's nothing that can race or need a mutex.
#include "engine.h"
#include <iostream>

int main(int argc, char** argv) {
    // Needs 2 arguments: wav path, database path
    if (argc < 3) {
        std::cerr << "Usage: recognize <wavPath> <fingerprintsDbPath>\n";
        return 1;
    }

    std::string wavPath = argv[1];
    std::string dbPath = argv[2];

    // Load the whole database into memory
    FingerprintDB db = load_fingerprint_db(dbPath);

    // Fingerprint the clip (song id -1 = not a stored song)
    auto queryFps = compute_fingerprints(wavPath, -1);
    if (queryFps.empty()) {
        std::cout << R"({"error":"no_query_fingerprints"})" << "\n";
        return 1;
    }

    // Find the best match and print it as JSON for the server to read
    std::cout << match_fingerprints(db, queryFps) << "\n";
    return 0;
}
