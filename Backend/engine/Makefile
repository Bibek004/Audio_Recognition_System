# Compiler and flags
CXX = g++
CXXFLAGS = -O2 -std=c++17
# Libraries to link: FFTW, libsndfile, math
LIBS = -lfftw3 -lsndfile -lm

# make builds both programs
all: enroll recognize

enroll: enroll_main.cpp engine.cpp engine.h
	$(CXX) $(CXXFLAGS) -o enroll enroll_main.cpp engine.cpp $(LIBS)

recognize: recognize_main.cpp engine.cpp engine.h
	$(CXX) $(CXXFLAGS) -o recognize recognize_main.cpp engine.cpp $(LIBS)

# make clean deletes the built programs
clean:
	rm -f enroll recognize
