package azure

import (
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strings"
)

func (c *Client) ListAssignees() ([]Identity, error) {
	byKey := map[string]Identity{}
	add := func(display, unique string) {
		addIdentity(byKey, display, unique)
	}

	team := c.conn.Team
	if team == "" {
		team = c.conn.Project
	}
	if c.conn.Project != "" && team != "" {
		u := c.withAPIVersion(
			c.collectionURL()+"/_apis/projects/"+url.PathEscape(c.conn.Project)+"/teams/"+url.PathEscape(team)+"/members",
			c.conn.APIVersion,
		) + "&$top=500"
		if data, _, err := c.request(http.MethodGet, u, nil, nil); err == nil {
			var payload struct {
				Value []struct {
					Identity *struct {
						DisplayName string `json:"displayName"`
						UniqueName  string `json:"uniqueName"`
					} `json:"identity"`
				} `json:"value"`
			}
			if json.Unmarshal(data, &payload) == nil {
				for _, row := range payload.Value {
					if row.Identity == nil {
						continue
					}
					add(row.Identity.DisplayName, row.Identity.UniqueName)
				}
			}
		}
	}

	if u := strings.TrimSpace(c.conn.Username); u != "" {
		add(u, u)
	}

	return sortedIdentities(byKey), nil
}

func addIdentity(byKey map[string]Identity, display, unique string) {
	display = strings.TrimSpace(display)
	unique = strings.TrimSpace(unique)
	if display == "" && unique == "" {
		return
	}
	if display == "" {
		display = unique
	}
	key := strings.ToLower(unique)
	if key == "" {
		key = strings.ToLower(display)
	}
	if prev, ok := byKey[key]; ok {
		// Prefer ФИО over DOMAIN\user as displayName.
		if looksLikeLogin(prev.DisplayName) && !looksLikeLogin(display) {
			prev.DisplayName = display
			byKey[key] = prev
		}
		if prev.UniqueName == "" && unique != "" {
			prev.UniqueName = unique
			byKey[key] = prev
		}
		return
	}
	byKey[key] = Identity{DisplayName: display, UniqueName: unique}
}

func looksLikeLogin(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return true
	}
	if strings.Contains(s, `\`) {
		return true
	}
	if strings.Contains(s, "@") && !strings.Contains(s, " ") {
		return true
	}
	return false
}

func sortedIdentities(byKey map[string]Identity) []Identity {
	out := make([]Identity, 0, len(byKey))
	for _, id := range byKey {
		out = append(out, id)
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].DisplayName) < strings.ToLower(out[j].DisplayName)
	})
	return out
}

func matchTokens(id Identity, tokens []string) bool {
	hay := strings.ToLower(id.DisplayName + " " + id.UniqueName)
	// Also match login without domain: CORP\ivanovaa → ivanovaa
	if i := strings.LastIndex(id.UniqueName, `\`); i >= 0 {
		hay += " " + strings.ToLower(id.UniqueName[i+1:])
	}
	if at := strings.Index(id.UniqueName, "@"); at > 0 {
		hay += " " + strings.ToLower(id.UniqueName[:at])
	}
	for _, t := range tokens {
		if t == "" {
			continue
		}
		if !strings.Contains(hay, t) {
			return false
		}
	}
	return true
}

func (c *Client) SearchAssignees(query string) ([]Identity, error) {
	q := strings.TrimSpace(query)
	local, _ := c.ListAssignees()
	if len(q) < 2 {
		return local, nil
	}

	tokens := strings.Fields(strings.ToLower(q))
	byKey := map[string]Identity{}

	// 1) Substring filter over team members (ivanov ⊂ ivanovaa, partial ФИО).
	for _, id := range local {
		if matchTokens(id, tokens) {
			addIdentity(byKey, id.DisplayName, id.UniqueName)
		}
	}

	// 2) IdentityPicker — better partial search on on-prem ADO.
	for _, id := range c.searchIdentityPicker(q) {
		addIdentity(byKey, id.DisplayName, id.UniqueName)
	}

	// 3) Classic identities API (prefix-ish).
	for _, id := range c.searchIdentitiesAPI(q) {
		addIdentity(byKey, id.DisplayName, id.UniqueName)
	}

	// If remote APIs returned people that don't substring-match tokens, still keep
	// local matches; if nothing local matched but remotes did, keep remotes.
	if len(byKey) == 0 {
		return nil, nil
	}
	return sortedIdentities(byKey), nil
}

func (c *Client) searchIdentitiesAPI(q string) []Identity {
	apiVersion := c.conn.APIVersion
	if apiVersion == "" {
		apiVersion = "5.0"
	}
	u := c.withAPIVersion(
		c.collectionURL()+"/_apis/identities",
		apiVersion,
	) + "&searchFilter=General&filterValue=" + url.QueryEscape(q) + "&queryMembership=None"

	data, _, err := c.request(http.MethodGet, u, nil, nil)
	if err != nil {
		return nil
	}
	var payload struct {
		Value []struct {
			DisplayName         string `json:"displayName"`
			ProviderDisplayName string `json:"providerDisplayName"`
			Properties          map[string]struct {
				Value string `json:"$value"`
			} `json:"properties"`
		} `json:"value"`
	}
	if json.Unmarshal(data, &payload) != nil {
		return nil
	}
	var out []Identity
	for _, row := range payload.Value {
		unique := ""
		displayDir := ""
		if row.Properties != nil {
			for _, key := range []string{"Account", "Mail", "Description"} {
				if v := strings.TrimSpace(row.Properties[key].Value); v != "" {
					unique = v
					break
				}
			}
			displayDir = strings.TrimSpace(row.Properties["DirectoryDisplayName"].Value)
		}
		display := displayDir
		if display == "" || looksLikeLogin(display) {
			for _, cand := range []string{row.DisplayName, row.ProviderDisplayName, unique} {
				cand = strings.TrimSpace(cand)
				if cand != "" && !looksLikeLogin(cand) {
					display = cand
					break
				}
			}
		}
		if display == "" {
			display = strings.TrimSpace(row.DisplayName)
		}
		if display == "" {
			display = strings.TrimSpace(row.ProviderDisplayName)
		}
		if display == "" {
			display = unique
		}
		if display == "" {
			continue
		}
		out = append(out, Identity{DisplayName: display, UniqueName: unique})
	}
	return out
}

func (c *Client) searchIdentityPicker(q string) []Identity {
	apiVersion := "5.1-preview.1"
	u := c.withAPIVersion(c.collectionURL()+"/_apis/IdentityPicker/Identities", apiVersion)
	body, _ := json.Marshal(map[string]any{
		"query":           q,
		"identityTypes":   []string{"user"},
		"operationScopes": []string{"ims", "source"},
		"options":         map[string]any{"MinResults": 1, "MaxResults": 40},
		"properties": []string{
			"DisplayName", "Mail", "SamAccountName", "AccountName", "Department", "JobTitle",
		},
	})
	data, _, err := c.request(http.MethodPost, u, map[string]string{
		"Content-Type": "application/json",
	}, body)
	if err != nil {
		return nil
	}
	var payload struct {
		Results []struct {
			Identities []struct {
				DisplayName    string `json:"displayName"`
				SamAccountName string `json:"samAccountName"`
				SignInAddress  string `json:"signInAddress"`
				Mail           string `json:"mail"`
				ScopeName      string `json:"scopeName"`
			} `json:"identities"`
		} `json:"results"`
	}
	if json.Unmarshal(data, &payload) != nil {
		return nil
	}
	var out []Identity
	for _, block := range payload.Results {
		for _, entry := range block.Identities {
			unique := strings.TrimSpace(entry.SignInAddress)
			if unique == "" {
				unique = strings.TrimSpace(entry.Mail)
			}
			if unique == "" {
				sam := strings.TrimSpace(entry.SamAccountName)
				scope := strings.TrimSpace(entry.ScopeName)
				if sam != "" && scope != "" {
					unique = scope + `\` + sam
				} else {
					unique = sam
				}
			}
			display := strings.TrimSpace(entry.DisplayName)
			if display == "" {
				display = unique
			}
			if display == "" {
				continue
			}
			out = append(out, Identity{DisplayName: display, UniqueName: unique})
		}
	}
	return out
}
