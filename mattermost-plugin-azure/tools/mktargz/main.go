// mktargz builds a gzipped tar with explicit Unix file modes (packaging on Windows).
package main

import (
	"archive/tar"
	"compress/gzip"
	"flag"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

func main() {
	out := flag.String("out", "", "output .tar.gz path")
	rootPrefix := flag.String("prefix", "", "archive root prefix, e.g. com.azurefastboard.ado")
	flag.Parse()
	files := flag.Args() // specs: local|archiveRel|mode
	if *out == "" || *rootPrefix == "" || len(files) == 0 {
		fmt.Fprintln(os.Stderr, "usage: mktargz -out bundle.tar.gz -prefix plugin.id local|rel|mode ...")
		os.Exit(2)
	}

	f, err := os.Create(*out)
	if err != nil {
		fatal(err)
	}
	defer f.Close()
	gz := gzip.NewWriter(f)
	defer gz.Close()
	tw := tar.NewWriter(gz)
	defer tw.Close()

	dirs := map[string]bool{}
	addDir := func(dir string) error {
		dir = strings.Trim(strings.ReplaceAll(dir, `\`, "/"), "/")
		if dir == "" || dirs[dir] {
			return nil
		}
		parts := strings.Split(dir, "/")
		cur := ""
		for _, p := range parts {
			if cur == "" {
				cur = p
			} else {
				cur += "/" + p
			}
			if dirs[cur] {
				continue
			}
			hdr := &tar.Header{
				Name:     cur + "/",
				Typeflag: tar.TypeDir,
				Mode:     0o755,
				Uid:      0,
				Gid:      0,
			}
			if err := tw.WriteHeader(hdr); err != nil {
				return err
			}
			dirs[cur] = true
		}
		return nil
	}

	if err := addDir(*rootPrefix); err != nil {
		fatal(err)
	}

	for _, spec := range files {
		local, rel, mode, err := parseSpec(spec)
		if err != nil {
			fatal(err)
		}
		arcName := path.Join(*rootPrefix, filepath.ToSlash(rel))
		if err := addDir(path.Dir(arcName)); err != nil {
			fatal(err)
		}
		if err := writeFile(tw, local, arcName, mode); err != nil {
			fatal(err)
		}
		fmt.Printf("+ %s mode=%04o\n", arcName, mode)
	}
}

func parseSpec(spec string) (local, rel string, mode int64, err error) {
	mode = 0o644
	parts := strings.Split(spec, "|")
	if len(parts) < 2 {
		return "", "", 0, fmt.Errorf("bad spec %q (want local|rel|mode)", spec)
	}
	local, rel = parts[0], parts[1]
	if len(parts) >= 3 && parts[2] != "" {
		var m int
		if _, err = fmt.Sscanf(parts[2], "%o", &m); err != nil {
			return "", "", 0, fmt.Errorf("bad mode in %q: %w", spec, err)
		}
		mode = int64(m)
	}
	return local, rel, mode, nil
}

func writeFile(tw *tar.Writer, local, arcName string, mode int64) error {
	in, err := os.Open(local)
	if err != nil {
		return err
	}
	defer in.Close()
	st, err := in.Stat()
	if err != nil {
		return err
	}

	hdr := &tar.Header{
		Name:     arcName,
		Size:     st.Size(),
		Mode:     mode,
		ModTime:  st.ModTime(),
		Typeflag: tar.TypeReg,
		Uid:      0,
		Gid:      0,
	}
	if err := tw.WriteHeader(hdr); err != nil {
		return err
	}
	n, err := io.Copy(tw, in)
	if err != nil {
		return err
	}
	if n != st.Size() {
		return fmt.Errorf("short write for %s: %d/%d", arcName, n, st.Size())
	}
	return nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
