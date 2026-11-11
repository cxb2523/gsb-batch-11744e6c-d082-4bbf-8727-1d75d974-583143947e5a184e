package main

import (
	"crypto/sha256"
	"encoding/base32"
	"encoding/json"
)

// This module is a pure, side-effect-free re-implementation of the decision
// logic behind the write endpoints PostPatch, UpdatePatch and DeletePatch
// (see api.go). It works solely on an in-memory data snapshot: it never opens
// the database, never touches the file system and never performs network I/O.
// Every exported type is plain data and can be JSON-marshalled; it contains no
// http.Request, session store or function values.

// Audit operation kinds.
const (
	AuditOpPost   = "post"
	AuditOpUpdate = "update"
	AuditOpDelete = "delete"
)

// Rejection stages reported by AuditWrite.
const (
	// AuditStageNone means the operation would be accepted.
	AuditStageNone = ""
	// AuditStageInvalidInput covers malformed audit snapshots, e.g. an
	// unknown operation kind. The real handlers have no equivalent failure.
	AuditStageInvalidInput = "invalid-input"
	AuditStageNotLoggedIn  = "not-logged-in"
	AuditStagePatchMissing = "patch-not-found"
	AuditStageNotAuthor    = "not-author"
	AuditStageValidation   = "field-validation"
	AuditStageUniqueness   = "uniqueness"
)

// Length limits, kept identical to CheckPatchValid in api.go.
const (
	auditMaxTitleChars = 50
	auditMaxFileChars  = 100000
	auditRandomIdBytes = 5
	auditRandomIdLen   = 6
)

// AuditForm is the form-data portion of the snapshot. The map mirrors the
// r.FormValue(...) calls in the handlers and may be nil.
type AuditForm struct {
	Fields map[string]string `json:"fields"`
}

// AuditPatch is one existing patch inside the snapshot. It carries exactly the
// MasherPatch fields the audit needs.
type AuditPatch struct {
	Id           string            `json:"id"`
	Title        string            `json:"title"`
	Author       string            `json:"author"`
	Files        map[string]string `json:"files"`
	DateCreated  int64             `json:"date_created"`
	DateModified int64             `json:"date_modified"`
}

// AuditSnapshot is the full pure-data input to AuditWrite.
type AuditSnapshot struct {
	Operation string       `json:"operation"`
	Form      AuditForm    `json:"form"`
	Username  string       `json:"username"`
	PatchList []AuditPatch `json:"patch_list"`
}

// AuditCheck is one ordered entry in the audit checklist.
type AuditCheck struct {
	Name   string `json:"name"`
	Passed bool   `json:"passed"`
	// Reason is empty when Passed is true.
	Reason string `json:"reason,omitempty"`
}

// AuditAccepted describes the write that would take place when an operation is
// accepted. It is nil for rejected operations.
type AuditAccepted struct {
	// PatchId is the id that would be written: a freshly generated id for
	// post, the existing target id for update/delete.
	PatchId string `json:"patch_id"`
	Title   string `json:"title"`
	Author  string `json:"author"`
	// DateModifiedRefreshed is true when the handler would assign a new
	// DateModified value (post and update; delete removes the row).
	DateModifiedRefreshed bool `json:"date_modified_refreshed"`
	// Operation echoes the audited operation.
	Operation string `json:"operation"`
}

// AuditResult is the structured, JSON-serializable audit outcome.
type AuditResult struct {
	Accepted  bool   `json:"accepted"`
	Operation string `json:"operation"`
	// RejectStage is one of the AuditStage* constants; empty when accepted.
	RejectStage string `json:"reject_stage,omitempty"`
	// RejectReason is a human-readable explanation; empty when accepted. Its
	// wording matches the message suffix produced by the real handler.
	RejectReason string         `json:"reject_reason,omitempty"`
	Checks       []AuditCheck   `json:"checks"`
	AcceptedInfo *AuditAccepted `json:"accepted_info,omitempty"`
}

// AuditWrite evaluates a write operation against a pure data snapshot. It never
// panics: missing form fields, a nil patch list or an unknown operation all
// produce a structured rejection (or acceptance) rather than a crash.
func AuditWrite(snapshot AuditSnapshot) AuditResult {
	result := AuditResult{
		Operation: snapshot.Operation,
		Checks:    []AuditCheck{},
	}

	form := snapshot.Form.Fields  // nil-safe: reading a nil map returns "".
	patches := snapshot.PatchList // nil-safe: ranging over a nil slice runs zero times.

	switch snapshot.Operation {
	case AuditOpPost:
		auditPost(&result, form, snapshot.Username, patches)
	case AuditOpUpdate:
		auditUpdate(&result, form, snapshot.Username, patches)
	case AuditOpDelete:
		auditDelete(&result, form, snapshot.Username, patches)
	default:
		reject(&result, AuditStageInvalidInput,
			"Unknown audit operation \""+snapshot.Operation+"\": expected post, update or delete.")
	}
	return result
}

func auditPost(result *AuditResult, form map[string]string, username string, patches []AuditPatch) {
	// PostPatch order: login -> build patch -> CheckPatchValid -> CheckPatchUnique.
	if !addLoginCheck(result, username) {
		reject(result, AuditStageNotLoggedIn, "You are not logged in.")
		return
	}

	mainScript, mainPresent := form["main_script"]
	patchDesc := form["desc"]
	title := form["title"]
	// A real HTTP form always contains the main_script key; when the snapshot
	// omits it entirely, mirror a row whose Files map has no main.sp entry so
	// the has-main-sp check fails instead of silently treating "" as a file.
	candidateFiles := map[string]string{
		"readme.txt": patchDesc,
	}
	if mainPresent {
		candidateFiles["main.sp"] = mainScript
	}
	candidate := AuditPatch{
		Title:  title,
		Author: username,
		Files:  candidateFiles,
	}

	if reason, ok := addValidityChecks(result, candidate); !ok {
		reject(result, AuditStageValidation, reason)
		return
	}

	if reason, ok := addUniquenessChecks(result, candidate, patches); !ok {
		reject(result, AuditStageUniqueness, reason)
		return
	}

	newId := GenerateAuditId(snapshotHashInputs(AuditOpPost, title, mainScript, patchDesc, username))
	accept(result, &AuditAccepted{
		PatchId:               newId,
		Title:                 title,
		Author:                username,
		DateModifiedRefreshed: true, // PostPatch stamps DateModified = time.Now().
		Operation:             AuditOpPost,
	})
}

func auditUpdate(result *AuditResult, form map[string]string, username string, patches []AuditPatch) {
	// UpdatePatch order: RetrievePatch(update_id) -> author check ->
	// overwrite title/files and stamp DateModified -> CheckPatchValid.
	targetId := form["update_id"]
	target, found := findPatch(patches, targetId)
	addCheck(result, AuditCheck{
		Name:   "target-patch-exists",
		Passed: found,
		Reason: notFoundReason(found),
	})
	if !found {
		reject(result, AuditStagePatchMissing, "Could not find existing patch in database.")
		return
	}

	if !addLoginCheck(result, username) {
		// Mirror the handler: with no session name, currentUser ("") differs
		// from the stored author, so it reports the not-author message.
		reject(result, AuditStageNotAuthor, "You are not the author of this patch.")
		return
	}

	addCheck(result, AuditCheck{
		Name:   "current-user-is-author",
		Passed: username == target.Author,
		Reason: notAuthorReason(username == target.Author),
	})
	if username != target.Author {
		reject(result, AuditStageNotAuthor, "You are not the author of this patch.")
		return
	}

	// The handler reuses the stored row and replaces title/files in place; the
	// id, author and creation date are preserved.
	updated := AuditPatch{
		Id:           target.Id,
		DateCreated:  target.DateCreated,
		DateModified: target.DateModified,
		Title:        form["title"],
		Author:       target.Author,
		Files: map[string]string{
			"main.sp":    form["main_script"],
			"readme.txt": form["desc"],
		},
	}
	// UpdatePatch never calls CheckPatchUnique, so keeping the original title
	// or script cannot be rejected as a duplicate of itself.
	if reason, ok := addValidityChecks(result, updated); !ok {
		reject(result, AuditStageValidation, reason)
		return
	}

	accept(result, &AuditAccepted{
		PatchId:               target.Id,
		Title:                 updated.Title,
		Author:                updated.Author,
		DateModifiedRefreshed: true, // UpdatePatch assigns DateModified = time.Now().
		Operation:             AuditOpUpdate,
	})
}

func auditDelete(result *AuditResult, form map[string]string, username string, patches []AuditPatch) {
	// DeletePatch order: RetrievePatch(delete_id) -> author check ->
	// CheckPatchValid(stored row) -> delete.
	targetId := form["delete_id"]
	target, found := findPatch(patches, targetId)
	addCheck(result, AuditCheck{
		Name:   "target-patch-exists",
		Passed: found,
		Reason: notFoundReason(found),
	})
	if !found {
		reject(result, AuditStagePatchMissing, "Could not find existing patch in database.")
		return
	}

	if !addLoginCheck(result, username) {
		reject(result, AuditStageNotAuthor, "You are not the author of this patch.")
		return
	}

	addCheck(result, AuditCheck{
		Name:   "current-user-is-author",
		Passed: username == target.Author,
		Reason: notAuthorReason(username == target.Author),
	})
	if username != target.Author {
		reject(result, AuditStageNotAuthor, "You are not the author of this patch.")
		return
	}

	// DeletePatch validates the stored, unmodified row before deleting it.
	if reason, ok := addValidityChecks(result, target); !ok {
		reject(result, AuditStageValidation, reason)
		return
	}

	accept(result, &AuditAccepted{
		PatchId:               target.Id,
		Title:                 target.Title,
		Author:                target.Author,
		DateModifiedRefreshed: false, // the row is removed, never re-stamped.
		Operation:             AuditOpDelete,
	})
}

// addLoginCheck records the shared login gate. It mirrors the
// session.Values["name"].(string) type assertion used by the handlers.
func addLoginCheck(result *AuditResult, username string) bool {
	loggedIn := username != ""
	addCheck(result, AuditCheck{
		Name:   "user-is-logged-in",
		Passed: loggedIn,
		Reason: notLoggedInReason(loggedIn),
	})
	return loggedIn
}

// addValidityChecks records the five CheckPatchValid rules in the exact order
// the real function evaluates them, stopping at the first failure just like the
// handler (which returns on the first error).
func addValidityChecks(result *AuditResult, patch AuditPatch) (string, bool) {
	mainScript, mainExists := patch.Files["main.sp"]

	mainPresentCheck := AuditCheck{Name: "has-main-sp", Passed: mainExists}
	if !mainExists {
		mainPresentCheck.Reason = "Patch must have a main.sp file"
	}
	addCheck(result, mainPresentCheck)
	if !mainExists {
		return mainPresentCheck.Reason, false
	}

	titlePresentCheck := AuditCheck{Name: "title-non-empty", Passed: patch.Title != ""}
	if patch.Title == "" {
		titlePresentCheck.Reason = "Title is missing or empty."
	}
	addCheck(result, titlePresentCheck)
	if patch.Title == "" {
		return titlePresentCheck.Reason, false
	}

	scriptLengthCheck := AuditCheck{Name: "main-sp-within-limit", Passed: len(mainScript) <= auditMaxFileChars}
	if len(mainScript) > auditMaxFileChars {
		scriptLengthCheck.Reason = "Script too long (> 100K characters)."
	}
	addCheck(result, scriptLengthCheck)
	if len(mainScript) > auditMaxFileChars {
		return scriptLengthCheck.Reason, false
	}

	readmeLengthCheck := AuditCheck{
		Name:   "readme-within-limit",
		Passed: len(patch.Files["readme.txt"]) <= auditMaxFileChars,
	}
	if len(patch.Files["readme.txt"]) > auditMaxFileChars {
		readmeLengthCheck.Reason = "Description too long (> 100K characters)."
	}
	addCheck(result, readmeLengthCheck)
	if len(patch.Files["readme.txt"]) > auditMaxFileChars {
		return readmeLengthCheck.Reason, false
	}

	titleLengthCheck := AuditCheck{Name: "title-within-limit", Passed: len(patch.Title) <= auditMaxTitleChars}
	if len(patch.Title) > auditMaxTitleChars {
		titleLengthCheck.Reason = "Title too long (> 50 characters)."
	}
	addCheck(result, titleLengthCheck)
	if len(patch.Title) > auditMaxTitleChars {
		return titleLengthCheck.Reason, false
	}

	return "", true
}

// addUniquenessChecks records the CheckPatchUnique rules. Only post reaches
// this check; the iteration order and failure messages match the real function.
func addUniquenessChecks(result *AuditResult, candidate AuditPatch, patches []AuditPatch) (string, bool) {
	var failure string
	passed := true
	for _, old := range patches {
		if old.Title == candidate.Title {
			failure = "A patch with the same title already exists."
			passed = false
			break
		}
		if old.Files["main.sp"] == candidate.Files["main.sp"] {
			failure = "A patch with the same script content already exists."
			passed = false
			break
		}
		if old.Id == candidate.Id {
			failure = "Internal laziness error, try again."
			passed = false
			break
		}
	}
	addCheck(result, AuditCheck{
		Name:   "title-and-script-unique",
		Passed: passed,
		Reason: failure,
	})
	return failure, passed
}

// GenerateAuditId produces a six-character base32 identifier from the given
// seed bytes. It mirrors the shape of RandomId in api.go (5 random bytes ->
// standard base32 -> first 6 characters) but is deterministic: the audit has no
// randomness and no side effects, so the same snapshot always yields the same
// id. The result is always six characters from the base32 alphabet.
func GenerateAuditId(seed []byte) string {
	digest := sha256.Sum256(seed)
	encoded := base32.StdEncoding.EncodeToString(digest[:auditRandomIdBytes])
	return encoded[:auditRandomIdLen]
}

// snapshotHashInputs builds a stable, unambiguous byte seed from the fields
// that identify a post operation.
func snapshotHashInputs(operation, title, mainScript, desc, username string) []byte {
	seed := []byte(operation)
	seed = appendLengthPrefixed(seed, title)
	seed = appendLengthPrefixed(seed, mainScript)
	seed = appendLengthPrefixed(seed, desc)
	seed = appendLengthPrefixed(seed, username)
	return seed
}

func appendLengthPrefixed(dst []byte, value string) []byte {
	length := len(value)
	dst = append(dst, byte(length>>24), byte(length>>16), byte(length>>8), byte(length))
	return append(dst, value...)
}

func findPatch(patches []AuditPatch, id string) (AuditPatch, bool) {
	for _, patch := range patches {
		if patch.Id == id {
			return patch, true
		}
	}
	return AuditPatch{}, false
}

func addCheck(result *AuditResult, check AuditCheck) {
	result.Checks = append(result.Checks, check)
}

func reject(result *AuditResult, stage, reason string) {
	result.Accepted = false
	result.RejectStage = stage
	result.RejectReason = reason
}

func accept(result *AuditResult, info *AuditAccepted) {
	result.Accepted = true
	result.AcceptedInfo = info
}

func notLoggedInReason(loggedIn bool) string {
	if loggedIn {
		return ""
	}
	return "You are not logged in."
}

func notFoundReason(found bool) string {
	if found {
		return ""
	}
	return "Could not find existing patch in database."
}

func notAuthorReason(isAuthor bool) string {
	if isAuthor {
		return ""
	}
	return "You are not the author of this patch."
}

// MarshalAuditResult is a convenience wrapper that guarantees the result can be
// JSON-serialized. It exists mainly to make the no-side-effect contract
// explicit and easy to exercise from tests.
func MarshalAuditResult(result AuditResult) ([]byte, error) {
	return json.Marshal(result)
}
