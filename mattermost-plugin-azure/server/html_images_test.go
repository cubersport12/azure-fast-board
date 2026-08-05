package main

import "testing"

func TestStripBlobImages(t *testing.T) {
	in := `<p>step</p><img src="blob:http://localhost/abc" alt="x"><img src="https://ado/_apis/wit/attachments/1">`
	got := stripBlobImages(in)
	want := `<p>step</p><img src="https://ado/_apis/wit/attachments/1">`
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
