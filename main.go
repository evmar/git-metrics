package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

type Commit struct {
	Commit string                 `json:"commit"`
	Date   int                    `json:"date"`
	Desc   string                 `json:"desc"`
	Data   map[string]interface{} `json:"data,omitempty"`
	Broken bool                   `json:"broken,omitempty"`
}

type db struct {
	commits []*Commit
}

func loadDB(path string) (*db, error) {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &db{}, nil
		}
		return nil, err
	}
	defer f.Close()
	var commits []*Commit
	if err := json.NewDecoder(f).Decode(&commits); err != nil {
		return nil, err
	}
	db := &db{commits: commits}
	return db, nil
}

func (db *db) merge(commits []*Commit) {
	var out []*Commit
	for _, c := range commits {
		for i, d := range db.commits {
			if c.Commit == d.Commit {
				c = d
				db.commits = db.commits[i+1:]
				break
			}
		}
		out = append(out, c)
	}
	out = append(out, db.commits...)
	db.commits = out
}

func (db *db) save(path string) error {
	f, err := os.Create(path + ".tmp")
	if err != nil {
		return err
	}
	defer os.Remove(path + ".tmp")
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(db.commits); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(path+".tmp", path); err != nil {
		return err
	}
	return nil
}

type config struct {
	dir string
	cmd string
}

func getCommits(dir string) ([]*Commit, error) {
	cmd := exec.Command("git", "log", "--pretty=format:%H %ct %s", "-n", "500", "main")
	cmd.Dir = dir
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var commits []*Commit
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		parts := strings.SplitN(line, " ", 3)
		if len(parts) != 3 {
			return nil, fmt.Errorf("unexpected line: %q", line)
		}
		date, err := strconv.Atoi(parts[1])
		if err != nil {
			return nil, err
		}
		commit := &Commit{
			Date:   date,
			Commit: parts[0],
			Desc:   parts[2],
		}
		commits = append(commits, commit)
	}
	return commits, nil
}

func runOne(config *config, commit *Commit) error {
	fmt.Println("git-metrics: evaluating", commit.Commit)

	cmd := exec.Command("git", "checkout", commit.Commit)
	cmd.Dir = config.dir
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("git checkout failed: %w", err)
	}

	cmd = exec.Command("/bin/sh", "-c", config.cmd)
	if config.dir != "" {
		cmd.Dir = config.dir
	}
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		if len(out) > 0 {
			fmt.Printf("%s", out)
		} else {
			fmt.Printf("[metrics command had no output]\n")
		}
		return fmt.Errorf("metrics tool failed: %w", err)
	}

	value, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	if err != nil {
		return fmt.Errorf("failed to parse output as float: %v", err)
	}

	fmt.Printf("git-metrics: => %f\n\n", value)

	commit.Data = map[string]interface{}{"size": value}
	return nil
}

func prompt(msg string, letters string) (byte, error) {
	for {
		fmt.Print(msg)
		var resp string
		if _, err := fmt.Scanln(&resp); err != nil {
			return 0, err
		}
		if len(resp) == 1 && strings.Contains(letters, resp) {
			return resp[0], nil
		}
	}
}

func runOneInteractive(config *config, commit *Commit) error {
	for {
		err := runOne(config, commit)
		if err == nil {
			return nil
		}
		fmt.Printf("\ngit-metrics: %v\n", err)
		choice, err := prompt("(r)etry, permanently mark (b)roken, or (s)kip for now: ", "rbs")
		if err != nil {
			return err
		}
		switch choice {
		case 'r':
			continue
		case 'b':
			commit.Broken = true
			return nil
		case 's':
			return nil
		}
	}
}

func run() error {
	dir := flag.String("dir", "", "Directory to run command in")
	cmdline := flag.String("cmd", "", "Command to run")
	flag.Parse()

	if *cmdline == "" {
		return fmt.Errorf("must provide -cmd")
	}

	config := &config{
		dir: *dir,
		cmd: *cmdline,
	}

	commits, err := getCommits(config.dir)
	if err != nil {
		return err
	}

	db, err := loadDB("db.json")
	if err != nil {
		return err
	}
	db.merge(commits)
	if err := db.save("db.json"); err != nil {
		return err
	}

	for _, commit := range db.commits {
		if commit.Data != nil || commit.Broken {
			continue
		}
		if err := runOneInteractive(config, commit); err != nil {
			return err
		}
		if err := db.save("db.json"); err != nil {
			return err
		}
	}

	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}
