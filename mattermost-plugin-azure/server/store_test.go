package main

import (
	"crypto/sha256"
	"testing"
)

func TestSha256KeyStable(t *testing.T) {
	a := sha256Key("abc")
	b := sha256Key("abc")
	if string(a) != string(b) {
		t.Fatal("unstable")
	}
	sum := sha256.Sum256([]byte("abc"))
	if string(a) != string(sum[:]) {
		t.Fatal("mismatch")
	}
}

func TestLegacyDefaultKeyPresent(t *testing.T) {
	if legacyDefaultKey == "" {
		t.Fatal("empty legacy key")
	}
}
