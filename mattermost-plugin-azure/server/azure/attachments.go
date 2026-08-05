package azure

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// UploadAttachment uploads bytes to ADO, links them as AttachedFile, and returns the attachment URL
// for embedding in ReproSteps / Description HTML (<img src="…">).
func (c *Client) UploadAttachment(workItemID int, fileName string, data []byte) (string, error) {
	if workItemID <= 0 || len(data) == 0 {
		return "", fmt.Errorf("empty attachment")
	}
	if strings.TrimSpace(fileName) == "" {
		fileName = "screenshot.png"
	}

	uploadURL := c.api("/_apis/wit/attachments?fileName=" + url.QueryEscape(fileName) + "&uploadType=Simple")
	uploaded, _, err := c.request(http.MethodPost, uploadURL, map[string]string{
		"Content-Type": "application/octet-stream",
	}, data)
	if err != nil {
		return "", err
	}
	var ref struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(uploaded, &ref); err != nil || ref.URL == "" {
		return "", fmt.Errorf("invalid attachment upload response")
	}

	rev, err := c.workItemRev(workItemID)
	if err != nil {
		return "", err
	}

	ops := []map[string]any{{
		"op":   "add",
		"path": "/relations/-",
		"value": map[string]any{
			"rel": "AttachedFile",
			"url": ref.URL,
			"attributes": map[string]any{
				"comment": fileName,
			},
		},
	}}
	body, err := json.Marshal(ops)
	if err != nil {
		return "", err
	}
	patchURL := c.api(fmt.Sprintf("/_apis/wit/workitems/%d", workItemID))
	_, _, err = c.request(http.MethodPatch, patchURL, map[string]string{
		"Content-Type": "application/json-patch+json",
		"If-Match":     fmt.Sprintf("%d", rev),
	}, body)
	if err != nil {
		return "", err
	}
	return ref.URL, nil
}

// UpdateWorkItemField patches a single HTML/text field (e.g. ReproSteps after inline image upload).
func (c *Client) UpdateWorkItemField(workItemID int, field, value string) error {
	if workItemID <= 0 || strings.TrimSpace(field) == "" {
		return fmt.Errorf("invalid field update")
	}
	rev, err := c.workItemRev(workItemID)
	if err != nil {
		return err
	}
	ops := []map[string]any{{
		"op":    "add",
		"path":  "/fields/" + field,
		"value": value,
	}}
	body, err := json.Marshal(ops)
	if err != nil {
		return err
	}
	patchURL := c.api(fmt.Sprintf("/_apis/wit/workitems/%d", workItemID))
	_, _, err = c.request(http.MethodPatch, patchURL, map[string]string{
		"Content-Type": "application/json-patch+json",
		"If-Match":     fmt.Sprintf("%d", rev),
	}, body)
	return err
}

func (c *Client) workItemRev(workItemID int) (int, error) {
	currentURL := c.api(fmt.Sprintf("/_apis/wit/workitems/%d", workItemID))
	curData, _, err := c.request(http.MethodGet, currentURL, nil, nil)
	if err != nil {
		return 0, err
	}
	var current struct {
		Rev int `json:"rev"`
	}
	if err := json.Unmarshal(curData, &current); err != nil {
		return 0, err
	}
	return current.Rev, nil
}
