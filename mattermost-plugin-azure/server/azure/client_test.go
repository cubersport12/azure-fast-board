package azure

import "testing"

func TestParseWindowsUser(t *testing.T) {
	domain, user := parseWindowsUser(`CORP\ivanov`)
	if domain != "CORP" || user != "ivanov" {
		t.Fatalf("got %q %q", domain, user)
	}
	domain, user = parseWindowsUser("ivanov@corp.local")
	if domain != "" || user != "ivanov@corp.local" {
		t.Fatalf("got %q %q", domain, user)
	}
}

func TestNormalizeIterationPath(t *testing.T) {
	got := normalizeIterationPath(`Proj\Iteration\Sprint 1`, "Proj")
	if got != `Proj\Sprint 1` {
		t.Fatalf("got %q", got)
	}
}
