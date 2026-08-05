package azure

import (
	"strings"
)

// normalizeIterationPath strips the structural "Iteration" segment from classification paths.
// Classification: Project\Iteration\Sprint → System.IterationPath: Project\Sprint
func normalizeIterationPath(path, project string) string {
	return stripClassificationSegment(path, "Iteration", project)
}

// normalizeAreaPath strips the structural "Area" segment from classification paths.
// Classification: Project\Area\Team → System.AreaPath: Project\Team
func normalizeAreaPath(path, project string) string {
	return stripClassificationSegment(path, "Area", project)
}

func stripClassificationSegment(path, segment, project string) string {
	raw := strings.TrimSpace(path)
	if raw == "" {
		return ""
	}
	raw = strings.ReplaceAll(raw, "/", `\`)
	raw = strings.TrimLeft(raw, `\`)
	for strings.Contains(raw, `\\`) {
		raw = strings.ReplaceAll(raw, `\\`, `\`)
	}

	strip := func(value, root string) string {
		prefix := root + `\` + segment + `\`
		if strings.HasPrefix(strings.ToLower(value), strings.ToLower(prefix)) {
			return root + `\` + value[len(prefix):]
		}
		if strings.EqualFold(value, root+`\`+segment) {
			return root
		}
		return value
	}

	if project = strings.TrimSpace(project); project != "" {
		raw = strip(raw, project)
	} else {
		parts := strings.SplitN(raw, `\`, 3)
		if len(parts) >= 2 && strings.EqualFold(parts[1], segment) {
			if len(parts) == 2 {
				raw = parts[0]
			} else {
				raw = parts[0] + `\` + parts[2]
			}
		}
	}
	for strings.Contains(raw, `\\`) {
		raw = strings.ReplaceAll(raw, `\\`, `\`)
	}
	return raw
}
