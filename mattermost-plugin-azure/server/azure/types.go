package azure

const (
	FieldTitle       = "System.Title"
	FieldDescription = "System.Description"
	FieldAssignedTo  = "System.AssignedTo"
	FieldAreaPath    = "System.AreaPath"
	FieldIteration   = "System.IterationPath"
	FieldTags        = "System.Tags"
	FieldReproSteps  = "Microsoft.VSTS.TCM.ReproSteps"
)

type AuthMethod string

const (
	AuthPassword AuthMethod = "password"
	AuthPAT      AuthMethod = "pat"
)

// Connection holds per-user Azure DevOps Server settings (mirrors frontend ConnectionConfig).
type Connection struct {
	ServerURL   string     `json:"serverUrl"`
	Collection  string     `json:"collection"`
	Project     string     `json:"project"`
	Team        string     `json:"team"`
	APIVersion  string     `json:"apiVersion"`
	Username    string     `json:"username"`
	AuthMethod  AuthMethod `json:"authMethod"`
	InsecureTLS bool       `json:"insecureTls"`
	// Secret is NTLM password — encrypted at rest in plugin KV.
	Secret string `json:"secret"`
}

type PathOption struct {
	Path string `json:"path"`
	Name string `json:"name"`
}

type CreateWorkItemInput struct {
	Type          string
	Title         string
	Description   string // Task / non-bug HTML or text
	ReproSteps    string // Bug
	AssignedTo    string
	AreaPath      string
	IterationPath string
	Tags          []string
}

type WorkItem struct {
	ID    int    `json:"id"`
	Rev   int    `json:"rev"`
	Title string `json:"title"`
	Type  string `json:"type"`
	URL   string `json:"url"`
}

type Identity struct {
	DisplayName string `json:"displayName"`
	UniqueName  string `json:"uniqueName"`
}
