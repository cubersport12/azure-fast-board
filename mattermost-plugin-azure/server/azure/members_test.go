package azure

import "testing"

func TestMatchTokensPartialLogin(t *testing.T) {
	id := Identity{DisplayName: "Иванов Алексей", UniqueName: `CORP\ivanovaa`}
	if !matchTokens(id, []string{"ivanov"}) {
		t.Fatal("expected ivanov to match ivanovaa")
	}
	if !matchTokens(id, []string{"иванов"}) {
		t.Fatal("expected fio token match")
	}
	if !matchTokens(id, []string{"иванов", "алек"}) {
		t.Fatal("expected multi-token fio match")
	}
	if matchTokens(id, []string{"петров"}) {
		t.Fatal("did not expect петров")
	}
}
