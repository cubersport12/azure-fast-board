package azure

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

type NamedEntity struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (c *Client) serverRoot() string {
	return strings.TrimRight(strings.TrimSpace(c.conn.ServerURL), "/")
}

func (c *Client) withAPIVersion(rawURL, version string) string {
	sep := "?"
	if strings.Contains(rawURL, "?") {
		sep = "&"
	}
	return rawURL + sep + "api-version=" + url.QueryEscape(version)
}

func (c *Client) discoverAPIVersion() string {
	candidates := []string{c.conn.APIVersion, "7.0", "7.1", "6.0", "5.1", "4.1"}
	seen := map[string]bool{}
	for _, version := range candidates {
		version = strings.TrimSpace(version)
		if version == "" || seen[version] {
			continue
		}
		seen[version] = true
		var probe string
		if c.conn.Collection != "" {
			probe = c.withAPIVersion(c.collectionURL()+"/_apis/projects", version) + "&$top=1"
		} else {
			probe = c.withAPIVersion(c.serverRoot()+"/_apis/projectCollections", version) + "&$top=1"
		}
		if _, _, err := c.request(http.MethodGet, probe, nil, nil); err == nil {
			c.conn.APIVersion = version
			return version
		}
	}
	if c.conn.APIVersion == "" {
		c.conn.APIVersion = "7.0"
	}
	return c.conn.APIVersion
}

// ListCollections mirrors frontend AzureClient.listCollections (NTLM, optional /tfs root).
func (c *Client) ListCollections() ([]NamedEntity, error) {
	apiVersion := c.discoverAPIVersion()
	roots := []string{c.serverRoot()}
	if !strings.HasSuffix(strings.ToLower(c.serverRoot()), "/tfs") {
		roots = append(roots, c.serverRoot()+"/tfs")
	}

	var lastErr error
	for _, root := range roots {
		u := c.withAPIVersion(root+"/_apis/projectCollections", apiVersion)
		data, _, err := c.request(http.MethodGet, u, nil, nil)
		if err != nil {
			lastErr = err
			continue
		}
		var payload struct {
			Value []struct {
				ID         string `json:"id"`
				Name       string `json:"name"`
				Collection *struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"collection"`
			} `json:"value"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			lastErr = err
			continue
		}
		out := make([]NamedEntity, 0, len(payload.Value))
		for _, entry := range payload.Value {
			id := entry.ID
			name := entry.Name
			if entry.Collection != nil {
				if id == "" {
					id = entry.Collection.ID
				}
				if name == "" {
					name = entry.Collection.Name
				}
			}
			if name == "" {
				name = id
			}
			if name == "" {
				continue
			}
			out = append(out, NamedEntity{ID: id, Name: name})
		}
		if len(out) > 0 {
			if root != c.serverRoot() {
				c.conn.ServerURL = root
			}
			return out, nil
		}
	}

	// Fallback: DefaultCollection probe
	for _, name := range []string{"DefaultCollection", "Default"} {
		u := c.withAPIVersion(
			c.serverRoot()+"/"+url.PathEscape(name)+"/_apis/projects",
			apiVersion,
		) + "&$top=1"
		if _, _, err := c.request(http.MethodGet, u, nil, nil); err == nil {
			return []NamedEntity{{ID: name, Name: name}}, nil
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("не удалось загрузить коллекции")
}

func (c *Client) ListProjects() ([]NamedEntity, error) {
	if strings.TrimSpace(c.conn.Collection) == "" {
		return nil, fmt.Errorf("collection is required")
	}
	apiVersion := c.discoverAPIVersion()
	u := c.withAPIVersion(c.collectionURL()+"/_apis/projects", apiVersion) + "&$top=500&stateFilter=WellFormed"
	data, _, err := c.request(http.MethodGet, u, nil, nil)
	if err != nil {
		return nil, err
	}
	var payload struct {
		Value []NamedEntity `json:"value"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}
	return payload.Value, nil
}

func (c *Client) ListTeams() ([]NamedEntity, error) {
	if strings.TrimSpace(c.conn.Collection) == "" || strings.TrimSpace(c.conn.Project) == "" {
		return nil, fmt.Errorf("collection and project are required")
	}
	apiVersion := c.discoverAPIVersion()
	u := c.withAPIVersion(
		c.collectionURL()+"/_apis/projects/"+url.PathEscape(c.conn.Project)+"/teams",
		apiVersion,
	)
	data, _, err := c.request(http.MethodGet, u, nil, nil)
	if err != nil {
		// Fallback used by frontend
		u2 := c.api("/_apis/teams")
		data, _, err = c.request(http.MethodGet, u2, nil, nil)
		if err != nil {
			return nil, err
		}
	}
	var payload struct {
		Value []NamedEntity `json:"value"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}
	return payload.Value, nil
}
