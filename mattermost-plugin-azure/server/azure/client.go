package azure

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

type Client struct {
	conn   Connection
	http   *http.Client
	ntlm   bool
}

func NewClient(conn Connection) *Client {
	if conn.APIVersion == "" {
		conn.APIVersion = "7.0"
	}
	if conn.AuthMethod == "" {
		conn.AuthMethod = AuthPassword
	}
	ntlm := conn.AuthMethod == AuthPassword
	return &Client{
		conn: conn,
		http: newHTTPClient(conn.InsecureTLS, ntlm),
		ntlm: ntlm,
	}
}

// Conn returns the current connection (may update ServerURL/APIVersion during discovery).
func (c *Client) Conn() Connection {
	return c.conn
}

func (c *Client) baseURL() string {
	return strings.TrimRight(strings.TrimSpace(c.conn.ServerURL), "/")
}

func (c *Client) collectionURL() string {
	base := c.baseURL()
	col := strings.Trim(c.conn.Collection, "/")
	if col == "" {
		return base
	}
	return base + "/" + col
}

func (c *Client) projectURL() string {
	return c.collectionURL() + "/" + url.PathEscape(c.conn.Project)
}

func (c *Client) api(path string) string {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	u := c.projectURL() + path
	sep := "?"
	if strings.Contains(u, "?") {
		sep = "&"
	}
	return u + sep + "api-version=" + url.QueryEscape(c.conn.APIVersion)
}

func (c *Client) request(method, rawURL string, headers map[string]string, body []byte) ([]byte, int, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	if headers == nil {
		headers = map[string]string{}
	}
	if _, ok := headers["Accept"]; !ok {
		headers["Accept"] = "application/json"
	}
	resp, err := doRequest(c.http, method, rawURL, c.conn.Username, c.conn.Secret, c.ntlm, headers, reader)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(data))
		if len(msg) > 400 {
			msg = msg[:400] + "…"
		}
		return data, resp.StatusCode, fmt.Errorf("Azure DevOps HTTP %d: %s", resp.StatusCode, msg)
	}
	return data, resp.StatusCode, nil
}

// Ping verifies credentials (same idea as frontend connectionData / collections).
func (c *Client) Ping() error {
	u := c.collectionURL() + "/_apis/connectionData?connectOptions=1&lastChangeId=-1&lastChangeId64=-1&api-version=" + url.QueryEscape(c.conn.APIVersion)
	_, _, err := c.request(http.MethodGet, u, nil, nil)
	if err != nil {
		// Fallback: list projects in collection.
		u2 := c.collectionURL() + "/_apis/projects?api-version=" + url.QueryEscape(c.conn.APIVersion)
		_, _, err2 := c.request(http.MethodGet, u2, nil, nil)
		return err2
	}
	return nil
}

func (c *Client) CreateWorkItem(input CreateWorkItemInput) (*WorkItem, error) {
	ops := []map[string]any{
		{"op": "add", "path": "/fields/" + FieldTitle, "value": input.Title},
	}
	if input.Type == "Bug" && strings.TrimSpace(input.ReproSteps) != "" {
		ops = append(ops, map[string]any{"op": "add", "path": "/fields/" + FieldReproSteps, "value": input.ReproSteps})
	} else if strings.TrimSpace(input.Description) != "" {
		ops = append(ops, map[string]any{"op": "add", "path": "/fields/" + FieldDescription, "value": input.Description})
	}
	if v := strings.TrimSpace(input.AssignedTo); v != "" {
		ops = append(ops, map[string]any{"op": "add", "path": "/fields/" + FieldAssignedTo, "value": v})
	}
	if v := normalizeAreaPath(input.AreaPath, c.conn.Project); v != "" {
		ops = append(ops, map[string]any{"op": "add", "path": "/fields/" + FieldAreaPath, "value": v})
	}
	if v := normalizeIterationPath(input.IterationPath, c.conn.Project); v != "" {
		ops = append(ops, map[string]any{"op": "add", "path": "/fields/" + FieldIteration, "value": v})
	}
	if len(input.Tags) > 0 {
		ops = append(ops, map[string]any{"op": "add", "path": "/fields/" + FieldTags, "value": strings.Join(input.Tags, "; ")})
	}

	body, err := json.Marshal(ops)
	if err != nil {
		return nil, err
	}
	rawURL := c.api("/_apis/wit/workitems/$" + url.PathEscape(input.Type))
	data, _, err := c.request(http.MethodPost, rawURL, map[string]string{
		"Content-Type": "application/json-patch+json",
	}, body)
	if err != nil {
		return nil, err
	}

	var raw struct {
		ID     int            `json:"id"`
		Rev    int            `json:"rev"`
		Fields map[string]any `json:"fields"`
		Links  struct {
			HTML struct {
				Href string `json:"href"`
			} `json:"html"`
		} `json:"_links"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	title, _ := raw.Fields[FieldTitle].(string)
	wtype, _ := raw.Fields["System.WorkItemType"].(string)
	wiURL := raw.Links.HTML.Href
	if wiURL == "" {
		wiURL = fmt.Sprintf("%s/%s/_workitems/edit/%d", c.collectionURL(), url.PathEscape(c.conn.Project), raw.ID)
	}
	return &WorkItem{ID: raw.ID, Rev: raw.Rev, Title: title, Type: wtype, URL: wiURL}, nil
}

type classificationNode struct {
	Name     string               `json:"name"`
	Path     string               `json:"path"`
	Children []classificationNode `json:"children"`
}

func walkPaths(node classificationNode, project string, rootPath string, out *[]PathOption, normalize func(string, string) string) {
	path := normalize(strings.TrimLeft(strings.ReplaceAll(node.Path, "/", `\`), `\`), project)
	if path == "" && node.Name != "" {
		if strings.EqualFold(node.Name, project) {
			path = project
		} else {
			path = project + `\` + node.Name
		}
	}
	if path != "" && (rootPath == "" || !strings.EqualFold(path, rootPath)) {
		name := path
		if rootPath != "" && strings.HasPrefix(strings.ToLower(path), strings.ToLower(rootPath)+`\`) {
			name = path[len(rootPath)+1:]
		} else {
			parts := strings.Split(path, `\`)
			name = parts[len(parts)-1]
		}
		*out = append(*out, PathOption{Path: path, Name: name})
	}
	for _, child := range node.Children {
		walkPaths(child, project, rootPath, out, normalize)
	}
}

func (c *Client) ListAreas() ([]PathOption, error) {
	data, _, err := c.request(http.MethodGet, c.api("/_apis/wit/classificationnodes/Areas?$depth=14"), nil, nil)
	if err != nil {
		return nil, err
	}
	var root classificationNode
	if err := json.Unmarshal(data, &root); err != nil {
		return nil, err
	}
	rootPath := normalizeAreaPath(strings.TrimLeft(strings.ReplaceAll(root.Path, "/", `\`), `\`), c.conn.Project)
	if rootPath == "" {
		rootPath = c.conn.Project
	}
	var out []PathOption
	walkPaths(root, c.conn.Project, rootPath, &out, normalizeAreaPath)
	return out, nil
}

func (c *Client) ListIterations() ([]PathOption, error) {
	data, _, err := c.request(http.MethodGet, c.api("/_apis/wit/classificationnodes/Iterations?$depth=14"), nil, nil)
	if err != nil {
		return nil, err
	}
	var root classificationNode
	if err := json.Unmarshal(data, &root); err != nil {
		return nil, err
	}
	rootPath := normalizeIterationPath(strings.TrimLeft(strings.ReplaceAll(root.Path, "/", `\`), `\`), c.conn.Project)
	if rootPath == "" {
		rootPath = c.conn.Project
	}
	var out []PathOption
	walkPaths(root, c.conn.Project, rootPath, &out, normalizeIterationPath)

	// Prefer team iterations when available.
	team := c.conn.Team
	if team == "" {
		team = c.conn.Project
	}
	teamURL := c.api("/" + url.PathEscape(team) + "/_apis/work/teamsettings/iterations")
	if data, _, err := c.request(http.MethodGet, teamURL, nil, nil); err == nil {
		var payload struct {
			Value []struct {
				Path string `json:"path"`
				Name string `json:"name"`
			} `json:"value"`
		}
		if json.Unmarshal(data, &payload) == nil && len(payload.Value) > 0 {
			byPath := map[string]PathOption{}
			for _, item := range out {
				byPath[strings.ToLower(item.Path)] = item
			}
			var teamFirst []PathOption
			for _, entry := range payload.Value {
				path := normalizeIterationPath(entry.Path, c.conn.Project)
				if path == "" {
					continue
				}
				name := entry.Name
				if name == "" {
					name = path
				}
				teamFirst = append(teamFirst, PathOption{Path: path, Name: name})
				byPath[strings.ToLower(path)] = PathOption{Path: path, Name: name}
			}
			rest := make([]PathOption, 0, len(byPath))
			seen := map[string]bool{}
			for _, item := range teamFirst {
				key := strings.ToLower(item.Path)
				if seen[key] {
					continue
				}
				seen[key] = true
				rest = append(rest, item)
			}
			for _, item := range out {
				key := strings.ToLower(item.Path)
				if seen[key] {
					continue
				}
				seen[key] = true
				rest = append(rest, item)
			}
			return rest, nil
		}
	}
	return out, nil
}
