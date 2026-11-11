package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// All tests use locally constructed snapshots only: no network, no real
// credentials, and no initialized storm database (the package-level db handle is
// nil throughout, so any accidental database access would panic here).

func form(fields map[string]string) AuditForm {
	return AuditForm{Fields: fields}
}

func samplePatch(id, title, author, mainScript string) AuditPatch {
	return AuditPatch{
		Id:           id,
		Title:        title,
		Author:       author,
		Files:        map[string]string{"main.sp": mainScript, "readme.txt": "readme"},
		DateCreated:  100,
		DateModified: 200,
	}
}

func checkByName(result AuditResult, name string) (AuditCheck, bool) {
	for _, check := range result.Checks {
		if check.Name == name {
			return check, true
		}
	}
	return AuditCheck{}, false
}

func assertAllChecksPassed(t *testing.T, result AuditResult) {
	t.Helper()
	if len(result.Checks) == 0 {
		t.Fatal("expected at least one recorded check, got none")
	}
	for _, check := range result.Checks {
		if !check.Passed {
			t.Errorf("check %q unexpectedly failed: %s", check.Name, check.Reason)
		}
	}
}

// Happy path: the logged-in author updates their own patch.
func TestAuditUpdateOwnPatchAccepted(t *testing.T) {
	existing := samplePatch("ABC123", "Old Title", "alice", "old script")
	snapshot := AuditSnapshot{
		Operation: AuditOpUpdate,
		Username:  "alice",
		Form: form(map[string]string{
			"update_id":   "ABC123",
			"title":       "New Title",
			"main_script": "new script",
			"desc":        "new description",
		}),
		PatchList: []AuditPatch{existing},
	}

	result := AuditWrite(snapshot)

	if !result.Accepted {
		t.Fatalf("expected acceptance, got rejection stage=%q reason=%q", result.RejectStage, result.RejectReason)
	}
	if result.RejectStage != AuditStageNone || result.RejectReason != "" {
		t.Errorf("accepted result must carry no rejection data, got stage=%q reason=%q", result.RejectStage, result.RejectReason)
	}
	assertAllChecksPassed(t, result)

	if result.AcceptedInfo == nil {
		t.Fatal("accepted result must include AcceptedInfo")
	}
	info := result.AcceptedInfo
	if info.PatchId != "ABC123" {
		t.Errorf("expected preserved id ABC123, got %q", info.PatchId)
	}
	if info.Title != "New Title" || info.Author != "alice" {
		t.Errorf("unexpected write payload: %+v", info)
	}
	if !info.DateModifiedRefreshed {
		t.Error("update must refresh DateModified")
	}
	if info.Operation != AuditOpUpdate {
		t.Errorf("expected operation %q, got %q", AuditOpUpdate, info.Operation)
	}

	// Update never performs uniqueness checking.
	if _, exists := checkByName(result, "title-and-script-unique"); exists {
		t.Error("update must not run a uniqueness check")
	}
}

// Happy path for completeness: author deletes own valid patch, no re-stamp.
func TestAuditDeleteOwnPatchAccepted(t *testing.T) {
	existing := samplePatch("DEL111", "Doomed", "alice", "sporth code")
	snapshot := AuditSnapshot{
		Operation: AuditOpDelete,
		Username:  "alice",
		Form:      form(map[string]string{"delete_id": "DEL111"}),
		PatchList: []AuditPatch{existing},
	}

	result := AuditWrite(snapshot)
	if !result.Accepted {
		t.Fatalf("expected acceptance, got %q: %q", result.RejectStage, result.RejectReason)
	}
	assertAllChecksPassed(t, result)
	if result.AcceptedInfo.PatchId != "DEL111" {
		t.Errorf("expected target id DEL111, got %q", result.AcceptedInfo.PatchId)
	}
	if result.AcceptedInfo.DateModifiedRefreshed {
		t.Error("delete must not refresh DateModified")
	}
}

// Negative path: anonymous post must be rejected at the login stage.
func TestAuditAnonymousPostRejected(t *testing.T) {
	snapshot := AuditSnapshot{
		Operation: AuditOpPost,
		Username:  "",
		Form: form(map[string]string{
			"title":       "Anonymous Effort",
			"main_script": "1 2 +",
			"desc":        "",
		}),
		PatchList: nil,
	}

	result := AuditWrite(snapshot) // must not panic with a nil patch list

	if result.Accepted {
		t.Fatal("anonymous post must be rejected")
	}
	if result.RejectStage != AuditStageNotLoggedIn {
		t.Errorf("expected stage %q, got %q", AuditStageNotLoggedIn, result.RejectStage)
	}
	if !strings.Contains(result.RejectReason, "not logged in") {
		t.Errorf("unexpected reason: %q", result.RejectReason)
	}
	loginCheck, exists := checkByName(result, "user-is-logged-in")
	if !exists || loginCheck.Passed || loginCheck.Reason == "" {
		t.Errorf("expected a failed login check, got %+v (exists=%v)", loginCheck, exists)
	}
}

// Negative path: a logged-in non-author cannot delete someone else's patch.
func TestAuditNonAuthorDeleteRejected(t *testing.T) {
	existing := samplePatch("XYZ789", "Alice Patch", "alice", "alice script")
	snapshot := AuditSnapshot{
		Operation: AuditOpDelete,
		Username:  "bob",
		Form:      form(map[string]string{"delete_id": "XYZ789"}),
		PatchList: []AuditPatch{existing},
	}

	result := AuditWrite(snapshot)

	if result.Accepted {
		t.Fatal("non-author delete must be rejected")
	}
	if result.RejectStage != AuditStageNotAuthor {
		t.Errorf("expected stage %q, got %q", AuditStageNotAuthor, result.RejectStage)
	}
	if result.RejectReason != "You are not the author of this patch." {
		t.Errorf("unexpected reason: %q", result.RejectReason)
	}

	existsCheck, ok := checkByName(result, "target-patch-exists")
	if !ok || !existsCheck.Passed {
		t.Errorf("target existence check should pass first, got %+v", existsCheck)
	}
	loginCheck, ok := checkByName(result, "user-is-logged-in")
	if !ok || !loginCheck.Passed {
		t.Errorf("bob is logged in, check should pass, got %+v", loginCheck)
	}
	authorCheck, ok := checkByName(result, "current-user-is-author")
	if !ok || authorCheck.Passed || authorCheck.Reason == "" {
		t.Errorf("expected a failed author check, got %+v (exists=%v)", authorCheck, ok)
	}
	if result.AcceptedInfo != nil {
		t.Error("rejected result must not carry AcceptedInfo")
	}
}

// Missing target ids must degrade to a structured "not found" result, never panic.
func TestAuditUpdateAndDeleteMissingTarget(t *testing.T) {
	cases := []struct {
		name string
		op   string
		id   string
	}{
		{"update missing update_id", AuditOpUpdate, "update_id"},
		{"delete missing delete_id", AuditOpDelete, "delete_id"},
		{"update unknown id", AuditOpUpdate, "update_id"},
		{"delete unknown id", AuditOpDelete, "delete_id"},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			value := ""
			if i >= 2 {
				value = "GHOST00"
			}
			snapshot := AuditSnapshot{
				Operation: tc.op,
				Username:  "alice",
				Form:      form(map[string]string{tc.id: value}), // nil-safe even when value is ""
				PatchList: []AuditPatch{samplePatch("REAL01", "Real", "alice", "x")},
			}
			result := AuditWrite(snapshot)
			if result.Accepted {
				t.Fatal("missing target must be rejected")
			}
			if result.RejectStage != AuditStagePatchMissing {
				t.Errorf("expected stage %q, got %q", AuditStagePatchMissing, result.RejectStage)
			}
		})
	}
}

// Unknown operation and a nil form map must not panic.
func TestAuditDegradedSnapshotsDoNotPanic(t *testing.T) {
	t.Run("unknown operation", func(t *testing.T) {
		result := AuditWrite(AuditSnapshot{
			Operation: "frobnicate",
			Username:  "alice",
			Form:      form(map[string]string{"title": "T"}),
			PatchList: nil,
		})
		if result.Accepted || result.RejectStage != AuditStageInvalidInput {
			t.Fatalf("expected invalid-input rejection, got %+v", result)
		}
		if result.RejectReason == "" {
			t.Error("invalid-input result needs a readable reason")
		}
	})

	t.Run("nil form map on post", func(t *testing.T) {
		result := AuditWrite(AuditSnapshot{
			Operation: AuditOpPost,
			Username:  "alice",
			Form:      AuditForm{Fields: nil},
			PatchList: nil,
		})
		if result.Accepted || result.RejectStage != AuditStageValidation {
			t.Fatalf("expected validation rejection, got %+v", result)
		}
		mainCheck, ok := checkByName(result, "has-main-sp")
		if !ok || mainCheck.Passed || mainCheck.Reason != "Patch must have a main.sp file" {
			t.Errorf("expected missing main.sp failure, got %+v", mainCheck)
		}
	})

	t.Run("nil form map on update", func(t *testing.T) {
		result := AuditWrite(AuditSnapshot{
			Operation: AuditOpUpdate,
			Username:  "alice",
			Form:      AuditForm{Fields: nil},
			PatchList: []AuditPatch{samplePatch("ABC123", "T", "alice", "x")},
		})
		if result.Accepted || result.RejectStage != AuditStagePatchMissing {
			t.Fatalf("expected not-found rejection, got %+v", result)
		}
	})
}

// Boundary lengths: the audit must agree with CheckPatchValid at exactly the
// 50/51-character title and 100000/100001-character script boundaries.
func TestAuditBoundariesMatchCheckPatchValid(t *testing.T) {
	cases := []struct {
		name         string
		title        string
		script       string
		scriptKey    bool // whether the snapshot/form includes main_script
		desc         string
		wantAccepted bool
		wantReason   string
	}{
		{
			name:         "title exactly 50",
			title:        strings.Repeat("a", 50),
			script:       "1",
			scriptKey:    true,
			wantAccepted: true,
		},
		{
			name:         "title 51",
			title:        strings.Repeat("a", 51),
			script:       "1",
			scriptKey:    true,
			wantAccepted: false,
			wantReason:   "Title too long (> 50 characters).",
		},
		{
			name:         "main.sp exactly 100000",
			title:        "Boundary Script",
			script:       strings.Repeat("s", 100000),
			scriptKey:    true,
			wantAccepted: true,
		},
		{
			name:         "main.sp 100001",
			title:        "Boundary Script",
			script:       strings.Repeat("s", 100001),
			scriptKey:    true,
			wantAccepted: false,
			wantReason:   "Script too long (> 100K characters).",
		},
		{
			name:         "empty title",
			title:        "",
			script:       "1",
			scriptKey:    true,
			wantAccepted: false,
			wantReason:   "Title is missing or empty.",
		},
		{
			name:         "missing main.sp",
			title:        "No Script",
			scriptKey:    false,
			wantAccepted: false,
			wantReason:   "Patch must have a main.sp file",
		},
		{
			name:         "readme 100001",
			title:        "Long Readme",
			script:       "1",
			scriptKey:    true,
			desc:         strings.Repeat("d", 100001),
			wantAccepted: false,
			wantReason:   "Description too long (> 100K characters).",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fields := map[string]string{
				"title": tc.title,
				"desc":  tc.desc,
			}
			if tc.scriptKey {
				fields["main_script"] = tc.script
			}
			snapshot := AuditSnapshot{
				Operation: AuditOpPost,
				Username:  "alice",
				Form:      form(fields),
				PatchList: nil, // no duplicates possible, isolating field validation
			}
			result := AuditWrite(snapshot)

			// Build the equivalent MasherPatch and run the real validator.
			mpFiles := map[string]string{"readme.txt": tc.desc}
			if tc.scriptKey {
				mpFiles["main.sp"] = tc.script
			}
			mp := MasherPatch{Title: tc.title, Author: "alice", Files: mpFiles}
			validErr := CheckPatchValid(mp)

			if (validErr == nil) != tc.wantAccepted {
				t.Fatalf("test case table disagrees with CheckPatchValid: err=%v", validErr)
			}
			if result.Accepted != tc.wantAccepted {
				t.Fatalf("audit accepted=%v, want %v (stage=%q reason=%q)",
					result.Accepted, tc.wantAccepted, result.RejectStage, result.RejectReason)
			}
			if !tc.wantAccepted {
				if result.RejectStage != AuditStageValidation {
					t.Errorf("expected validation stage, got %q", result.RejectStage)
				}
				if validErr == nil || result.RejectReason != validErr.Error() {
					t.Errorf("reason mismatch: audit=%q CheckPatchValid=%v", result.RejectReason, validErr)
				}
				if result.RejectReason != tc.wantReason {
					t.Errorf("expected reason %q, got %q", tc.wantReason, result.RejectReason)
				}
			}
		})
	}
}

// Updating a patch while keeping its own title and script is allowed: the
// handler never runs CheckPatchUnique on updates, so self-matches are not
// duplicates.
func TestAuditUpdateKeepsOwnTitleAndScript(t *testing.T) {
	existing := samplePatch("KEEP01", "Signature Work", "alice", "signature script")
	other := samplePatch("OTHER1", "Different Work", "bob", "different script")
	snapshot := AuditSnapshot{
		Operation: AuditOpUpdate,
		Username:  "alice",
		Form: form(map[string]string{
			"update_id":   "KEEP01",
			"title":       "Signature Work",   // unchanged
			"main_script": "signature script", // unchanged
			"desc":        "still the same",
		}),
		PatchList: []AuditPatch{existing, other},
	}

	result := AuditWrite(snapshot)
	if !result.Accepted {
		t.Fatalf("keeping own title/script must be accepted, got stage=%q reason=%q",
			result.RejectStage, result.RejectReason)
	}
	assertAllChecksPassed(t, result)
	if _, exists := checkByName(result, "title-and-script-unique"); exists {
		t.Error("update must not apply uniqueness checks against the patch itself")
	}
}

// Post duplicates (title or script) must be rejected at the uniqueness stage
// with the same messages CheckPatchUnique emits.
func TestAuditPostDuplicatesRejected(t *testing.T) {
	existing := samplePatch("DUP001", "Taken Title", "alice", "taken script")

	t.Run("duplicate title", func(t *testing.T) {
		result := AuditWrite(AuditSnapshot{
			Operation: AuditOpPost,
			Username:  "bob",
			Form: form(map[string]string{
				"title":       "Taken Title",
				"main_script": "brand new script",
			}),
			PatchList: []AuditPatch{existing},
		})
		if result.Accepted || result.RejectStage != AuditStageUniqueness {
			t.Fatalf("expected uniqueness rejection, got %+v", result)
		}
		if result.RejectReason != "A patch with the same title already exists." {
			t.Errorf("unexpected reason %q", result.RejectReason)
		}
	})

	t.Run("duplicate script", func(t *testing.T) {
		result := AuditWrite(AuditSnapshot{
			Operation: AuditOpPost,
			Username:  "bob",
			Form: form(map[string]string{
				"title":       "Fresh Title",
				"main_script": "taken script",
			}),
			PatchList: []AuditPatch{existing},
		})
		if result.Accepted || result.RejectStage != AuditStageUniqueness {
			t.Fatalf("expected uniqueness rejection, got %+v", result)
		}
		if result.RejectReason != "A patch with the same script content already exists." {
			t.Errorf("unexpected reason %q", result.RejectReason)
		}
	})
}

// Accepted posts get a deterministic six-character base32 id; update/delete
// report the existing id.
func TestAuditGeneratedIdShape(t *testing.T) {
	const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
	snapshot := AuditSnapshot{
		Operation: AuditOpPost,
		Username:  "alice",
		Form: form(map[string]string{
			"title":       "Brand New",
			"main_script": "0.1 0.2 sine",
			"desc":        "",
		}),
		PatchList: nil,
	}

	first := AuditWrite(snapshot)
	second := AuditWrite(snapshot)
	if !first.Accepted || !second.Accepted {
		t.Fatalf("both posts should be accepted: %+v %+v", first, second)
	}
	id := first.AcceptedInfo.PatchId
	if len(id) != 6 {
		t.Fatalf("id length must be 6, got %d (%q)", len(id), id)
	}
	for _, r := range id {
		if !strings.ContainsRune(base32Alphabet, r) {
			t.Fatalf("id %q contains non-base32 character %q", id, r)
		}
	}
	if id != second.AcceptedInfo.PatchId {
		t.Error("identical snapshots must produce the same deterministic id")
	}
	if !first.AcceptedInfo.DateModifiedRefreshed {
		t.Error("post must refresh DateModified")
	}

	different := AuditWrite(AuditSnapshot{
		Operation: AuditOpPost,
		Username:  "alice",
		Form: form(map[string]string{
			"title":       "Brand New (revised)",
			"main_script": "0.1 0.2 sine",
		}),
	})
	if different.AcceptedInfo.PatchId == id {
		t.Error("different snapshots should not normally collide on the generated id")
	}
}

// The output must round-trip through JSON without losing the decision data.
func TestAuditResultJSONSerializable(t *testing.T) {
	accepted := AuditWrite(AuditSnapshot{
		Operation: AuditOpPost,
		Username:  "alice",
		Form:      form(map[string]string{"title": "JSON Me", "main_script": "1"}),
	})
	rejected := AuditWrite(AuditSnapshot{
		Operation: AuditOpPost,
		Username:  "",
		Form:      form(map[string]string{"title": "Nope"}),
	})

	for name, result := range map[string]AuditResult{"accepted": accepted, "rejected": rejected} {
		t.Run(name, func(t *testing.T) {
			raw, err := MarshalAuditResult(result)
			if err != nil {
				t.Fatalf("marshal failed: %v", err)
			}
			var roundTripped AuditResult
			if err := json.Unmarshal(raw, &roundTripped); err != nil {
				t.Fatalf("unmarshal failed: %v", err)
			}
			if roundTripped.Accepted != result.Accepted ||
				roundTripped.RejectStage != result.RejectStage ||
				roundTripped.Operation != result.Operation {
				t.Errorf("round trip changed the decision: %s", string(raw))
			}
			if len(roundTripped.Checks) != len(result.Checks) {
				t.Errorf("check list lost during round trip: %d vs %d",
					len(roundTripped.Checks), len(result.Checks))
			}
		})
	}
}

// Anonymous update/delete against an existing patch follows the handler's
// behavior: rejected as not-author (the empty session name never matches).
func TestAuditAnonymousWriteOnExistingPatch(t *testing.T) {
	existing := samplePatch("OWNED1", "Owned", "alice", "x")
	for _, op := range []string{AuditOpUpdate, AuditOpDelete} {
		t.Run(op, func(t *testing.T) {
			idField := "update_id"
			if op == AuditOpDelete {
				idField = "delete_id"
			}
			result := AuditWrite(AuditSnapshot{
				Operation: op,
				Username:  "",
				Form:      form(map[string]string{idField: "OWNED1", "title": "Owned", "main_script": "x"}),
				PatchList: []AuditPatch{existing},
			})
			if result.Accepted || result.RejectStage != AuditStageNotAuthor {
				t.Fatalf("expected not-author rejection, got accepted=%v stage=%q",
					result.Accepted, result.RejectStage)
			}
			loginCheck, ok := checkByName(result, "user-is-logged-in")
			if !ok || loginCheck.Passed {
				t.Errorf("expected a failed login check, got %+v", loginCheck)
			}
		})
	}
}
