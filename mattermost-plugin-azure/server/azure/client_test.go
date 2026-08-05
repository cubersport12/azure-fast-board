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

func TestNormalizeAreaPath(t *testing.T) {
	cases := []struct {
		in, project, want string
	}{
		{`\Proj\Area\Team A`, "Proj", `Proj\Team A`},
		{`Proj\Area`, "Proj", "Proj"},
		{`Proj\Team A`, "Proj", `Proj\Team A`},
	}
	for _, tc := range cases {
		got := normalizeAreaPath(tc.in, tc.project)
		if got != tc.want {
			t.Fatalf("normalizeAreaPath(%q, %q)=%q want %q", tc.in, tc.project, got, tc.want)
		}
	}
}
