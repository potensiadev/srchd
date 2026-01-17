# SRCHD SaaS E2E Test Scenarios

**Document Version:** 1.0
**Created:** 2026-01-17
**Author:** QA Engineering Team
**Application:** srchd - AI-Powered Recruiting SaaS

---

## Table of Contents

1. [Authentication (Signup/Login)](#1-authentication-signuplogin)
2. [Candidates](#2-candidates)
3. [Positions](#3-positions)
4. [Upload](#4-upload)
5. [Analytics](#5-analytics)
6. [Settings](#6-settings)

---

## 1. Authentication (Signup/Login)

### Core Test Scenarios

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| AUTH-001 | New user signup via Google OAuth | 1. Navigate to `/signup` 2. Click "Google로 시작하기" 3. Complete Google auth flow 4. Verify redirect | User lands on `/consent` page for first-time users |
| AUTH-002 | Existing user login | 1. Navigate to `/login` 2. Click Google login button 3. Select existing Google account | User redirected to `/positions` (dashboard) |
| AUTH-003 | Consent flow completion | 1. Complete signup 2. On consent page, check all required boxes (TOS, Privacy, Third-Party Guarantee) 3. Click continue | `consents_completed=true` set, user redirected to dashboard |
| AUTH-004 | Marketing consent optional | 1. On consent page 2. Check only required consents 3. Leave marketing unchecked 4. Submit | User proceeds without marketing consent, `marketing_consent=false` |
| AUTH-005 | Logout flow | 1. Click user menu 2. Click logout 3. Verify session cleared | Redirect to `/?logged_out=true`, session cookies cleared |
| AUTH-006 | Session persistence | 1. Login successfully 2. Close browser 3. Reopen and navigate to dashboard | User remains authenticated if session not expired |
| AUTH-007 | Protected route redirect | 1. Without auth, navigate to `/positions` | Redirect to `/login` with `next=/positions` parameter |
| AUTH-008 | Auth callback handling | 1. Complete OAuth 2. Verify `/api/auth/callback` processes correctly | Auth tokens stored, user record created/updated in DB |
| AUTH-009 | Consent enforcement | 1. Login as user with `consents_completed=false` 2. Try to access dashboard | Forced redirect to `/consent` page |
| AUTH-010 | Multiple Google accounts | 1. Logout 2. Login with different Google account | New user profile created, separate workspace |

### Edge Cases

| ID | Edge Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| AUTH-E01 | OAuth popup blocked | 1. Enable popup blocker 2. Click Google login | Graceful error message: "Please allow popups for authentication" |
| AUTH-E02 | OAuth cancelled by user | 1. Click Google login 2. Close OAuth popup without completing | User stays on login page, no error thrown |
| AUTH-E03 | Google account with no email | 1. Attempt login with Google account that has email hidden | Appropriate error: "Email is required for signup" |
| AUTH-E04 | Concurrent sessions | 1. Login on Device A 2. Login on Device B with same account | Both sessions valid, or policy-based session invalidation |
| AUTH-E05 | Token expiration during session | 1. Login 2. Wait for token expiry 3. Perform action | Auto-refresh token or graceful redirect to login |
| AUTH-E06 | Network failure during OAuth | 1. Start OAuth flow 2. Kill network mid-flow | Error handling with retry option |
| AUTH-E07 | Browser back button after logout | 1. Logout 2. Press browser back | Should not restore authenticated state, redirect to login |
| AUTH-E08 | Consent page refresh | 1. On consent page 2. Check some boxes 3. Refresh page | Checkboxes reset, must re-check (stateless form) |
| AUTH-E09 | Direct consent page access when already consented | 1. As fully consented user 2. Navigate directly to `/consent` | Redirect to dashboard or show "already completed" |
| AUTH-E10 | OAuth state parameter tampering | 1. Intercept OAuth callback 2. Modify state parameter | Auth fails, security error logged, user not authenticated |

---

## 2. Candidates

### Core Test Scenarios

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| CAN-001 | View candidates list | 1. Login 2. Navigate to `/candidates` | Display paginated list with name, status, exp_years, skills |
| CAN-002 | Candidate detail view | 1. Click on candidate card 2. View full profile | All fields displayed: contact (masked), careers, education, skills, summary |
| CAN-003 | Filter by status | 1. On candidates list 2. Select status filter "completed" | Only completed candidates shown |
| CAN-004 | Search by name | 1. Enter candidate name in search 2. Press enter | Results filtered by name match |
| CAN-005 | Semantic search | 1. Enter skill/technology query 2. Execute search | Vector-based results ranked by relevance |
| CAN-006 | Sort by experience | 1. Click experience sort option | Candidates ordered by exp_years descending/ascending |
| CAN-007 | Sort by confidence score | 1. Click confidence sort | Candidates ordered by AI confidence score |
| CAN-008 | Pagination | 1. Scroll to bottom 2. Click next page or infinite scroll trigger | Next batch of candidates loaded |
| CAN-009 | Real-time status updates | 1. Have candidate in "processing" state 2. Wait for analysis completion | Status badge updates automatically to "completed" |
| CAN-010 | Find similar candidates | 1. Open candidate detail 2. Click "Find Similar" | List of candidates with similar skills/experience |
| CAN-011 | Duplicate detection | 1. Upload duplicate resume 2. Check duplicate warning | System flags potential duplicate with match percentage |
| CAN-012 | View candidate version history | 1. Open candidate with multiple versions 2. Click version history | See all versions with timestamps and changes |
| CAN-013 | Confidence level indicators | 1. View candidate with <80% confidence | "Requires Review" badge displayed, yellow/red warning |
| CAN-014 | Skills display | 1. Open candidate detail | Skills shown as tags with proper formatting |
| CAN-015 | Career timeline view | 1. Open candidate detail 2. View careers section | Chronological career display with company, position, dates |

### Edge Cases

| ID | Edge Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| CAN-E01 | Empty candidates state | 1. Login as new user with 0 candidates | Display empty state with CTA to upload resumes |
| CAN-E02 | Search with no results | 1. Search for "xyznonexistent123" | "No candidates found" message with search suggestions |
| CAN-E03 | Candidate with missing fields | 1. View candidate where AI couldn't extract name | Display "Unknown" or placeholder, flag for review |
| CAN-E04 | Very long career history (20+ jobs) | 1. View candidate with extensive career | Proper scrolling, no UI overflow, performance ok |
| CAN-E05 | Special characters in name | 1. Candidate with name "김철수 (Chris Kim)" | Proper rendering without encoding issues |
| CAN-E06 | Unicode/emoji in skills | 1. Candidate with skills containing Korean + emoji | Display correctly without corruption |
| CAN-E07 | Concurrent edit conflict | 1. User A opens candidate 2. User B updates 3. User A tries to save | Conflict resolution or last-write-wins with notification |
| CAN-E08 | Rapid pagination | 1. Click next page repeatedly very fast | No duplicate requests, proper debouncing |
| CAN-E09 | Filter + search combination | 1. Apply status filter 2. Then search by name | Both filters applied correctly (AND logic) |
| CAN-E10 | Candidate with 0 years experience | 1. View fresh graduate candidate | Display "신입" correctly, not "0 years" |

---

## 3. Positions

### Core Test Scenarios

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| POS-001 | Create position manually | 1. Navigate to `/positions/new` 2. Fill all required fields 3. Submit | Position created, redirect to position detail |
| POS-002 | Required field validation | 1. Try to submit position without title | Validation error: "Position title is required" |
| POS-003 | Skills limit validation | 1. Try to add >20 required skills | Error: "Maximum 20 skills allowed" |
| POS-004 | Experience range validation | 1. Set min_exp=10, max_exp=5 | Error: "Max experience must be >= min experience" |
| POS-005 | Salary validation | 1. Set salary_min=5000, salary_max=3000 | Error: "Max salary must be >= min salary" |
| POS-006 | Position list view | 1. Navigate to `/positions` | Grid/list of positions with status badges, stats |
| POS-007 | Position detail view | 1. Click on position card | Full JD, requirements, matched candidates list |
| POS-008 | Edit position | 1. Open position 2. Click edit 3. Modify fields 4. Save | Changes persisted, updated_at timestamp updated |
| POS-009 | Change position status | 1. Open position 2. Change status dropdown to "paused" | Status updated, badge color changes |
| POS-010 | Auto-match candidates | 1. Create position with specific skills 2. View matches | Candidates with matching skills shown with scores |
| POS-011 | View match score breakdown | 1. Open matched candidate in position 2. View score details | See skill/experience/education/semantic scores |
| POS-012 | Update candidate stage in pipeline | 1. Open position 2. Move candidate from "matched" to "contacted" | Stage updated, reflected in UI |
| POS-013 | JD upload and extraction | 1. On new position page 2. Upload JD PDF 3. Review extracted fields | Auto-populated: title, skills, experience, company |
| POS-014 | Position priority setting | 1. Create position with "urgent" priority | Urgent badge displayed, appears in urgent count |
| POS-015 | Deadline tracking | 1. Create position with deadline 7 days away | D-7 countdown displayed, urgency indicator |

### Edge Cases

| ID | Edge Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| POS-E01 | Position with 0 matching candidates | 1. Create position with very niche requirements | Display "No matches found" with suggestion to adjust criteria |
| POS-E02 | Description at character limit | 1. Enter exactly 10,000 characters in description | Saves successfully, no truncation |
| POS-E03 | Description exceeds limit | 1. Paste 15,000 characters | Error: "Description must be <= 10,000 characters" |
| POS-E04 | Special characters in title | 1. Position title: "Sr. Engineer (Contract) - Remote/NYC" | Properly saved and displayed |
| POS-E05 | Delete position with active candidates | 1. Position has candidates in "interviewing" stage 2. Try to delete | Warning: "Position has active candidates. Confirm?" |
| POS-E06 | Duplicate skill entry | 1. Try to add "Python" twice to required skills | Deduplicated automatically or error message |
| POS-E07 | JD upload - corrupted file | 1. Upload corrupted PDF as JD | Error: "Failed to parse document. Please try a different file" |
| POS-E08 | JD upload - password protected PDF | 1. Upload password-protected PDF | Error: "Cannot read password-protected files" |
| POS-E09 | Move all candidates to rejected | 1. Bulk reject all matched candidates | Candidates removed from pipeline, stats updated |
| POS-E10 | Position with past deadline | 1. View position where deadline has passed | Visual indicator (red/crossed out), status suggestion |

---

## 4. Upload

### Core Test Scenarios

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| UPL-001 | Single PDF upload | 1. Click upload 2. Select valid PDF resume 3. Upload | File uploads, candidate created with "processing" status |
| UPL-002 | Single DOCX upload | 1. Upload .docx resume | Successfully parsed and analyzed |
| UPL-003 | HWP file upload | 1. Upload .hwp (한글) resume | Successfully parsed using Hancom API |
| UPL-004 | HWPX file upload | 1. Upload .hwpx (한글 2007+) resume | Successfully parsed and analyzed |
| UPL-005 | DOC file upload | 1. Upload .doc (Word 97-2003) | Successfully converted and parsed |
| UPL-006 | Batch upload (multiple files) | 1. Select 5 resumes 2. Upload all | All 5 candidates created, progress shown for each |
| UPL-007 | Upload progress tracking | 1. Upload large file 2. Observe progress | Progress bar updates, percentage shown |
| UPL-008 | Credit deduction | 1. Check credits 2. Upload 1 resume 3. Verify credits | credits_used_this_month increased by 1 |
| UPL-009 | Quick extract display | 1. Upload resume 2. While processing, view candidate | Name, phone_masked, email_masked shown before full analysis |
| UPL-010 | Full analysis completion | 1. Upload resume 2. Wait for completion | All fields populated: skills, careers, education, summary |
| UPL-011 | Cancel upload in progress | 1. Start upload 2. Click cancel | Upload aborted, no candidate created, no credit charged |
| UPL-012 | Drag and drop upload | 1. Drag PDF file onto upload zone | File accepted, upload initiated |
| UPL-013 | File type validation on select | 1. Try to select .exe file | File rejected: "Unsupported file type" |
| UPL-014 | File size validation | 1. Select file >50MB | Error: "File exceeds 50MB limit" |
| UPL-015 | Retry failed upload | 1. Upload fails 2. Click retry | Re-attempts upload without re-selecting file |

### Edge Cases

| ID | Edge Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| UPL-E01 | Upload when credits exhausted | 1. Use all credits 2. Try to upload | Error: "Monthly quota exceeded. Upgrade or wait for reset" |
| UPL-E02 | Network disconnect during upload | 1. Start upload 2. Kill network at 50% | Error with retry option, partial upload cleaned up |
| UPL-E03 | Upload 30 files simultaneously (max) | 1. Select exactly 30 files 2. Upload | All queued and processed, UI remains responsive |
| UPL-E04 | Upload 31 files (exceed max) | 1. Select 31 files | Error: "Maximum 30 files per batch" |
| UPL-E05 | PDF with only images (scanned) | 1. Upload image-only scanned PDF | OCR attempted, or warning if unreadable |
| UPL-E06 | Corrupted file with valid extension | 1. Rename .txt to .pdf 2. Upload | Error: "File format invalid" (signature validation fails) |
| UPL-E07 | Resume in unsupported language | 1. Upload resume in Japanese | Best-effort parsing with lower confidence, warning flag |
| UPL-E08 | Very short resume (minimal content) | 1. Upload 1-page resume with only name/contact | Partial candidate created, "requires review" flag set |
| UPL-E09 | Very long resume (50+ pages) | 1. Upload extensive portfolio document | Parsing completes (may be slow), no timeout |
| UPL-E10 | Concurrent upload from multiple tabs | 1. Open 2 tabs 2. Upload from both simultaneously | Both succeed, separate candidates created, credits charged correctly |

---

## 5. Analytics

### Core Test Scenarios

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| ANA-001 | View total candidates count | 1. Navigate to `/analytics` | Card shows count of completed, latest candidates |
| ANA-002 | View this month's new candidates | 1. Check "This Month New" card | Accurate count of candidates created in current month |
| ANA-003 | View blind exports count | 1. Check "Blind Exports" card | Count matches blind_exports table records |
| ANA-004 | Experience distribution chart | 1. View experience breakdown | Bar chart with 신입/주니어/미들/시니어/리드급 segments |
| ANA-005 | Distribution percentages | 1. Observe chart labels | Percentages shown for each experience tier |
| ANA-006 | Distribution counts | 1. Observe chart data | Actual candidate counts shown per tier |
| ANA-007 | Chart hover interaction | 1. Hover over chart bars | Tooltip with exact numbers |
| ANA-008 | Data freshness | 1. Upload new candidate 2. Refresh analytics | New candidate reflected in counts |
| ANA-009 | Date range context | 1. View "This Month" metric | Correct month boundaries (1st to current date) |
| ANA-010 | Empty analytics state | 1. Login as new user | "No data yet" with guidance to upload resumes |

### Edge Cases

| ID | Edge Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| ANA-E01 | Analytics with 10,000+ candidates | 1. Account with massive dataset | Page loads within acceptable time (<3s), accurate counts |
| ANA-E02 | Experience calculation edge (exactly 2.0 years) | 1. Candidate with exactly 24 months experience | Correctly categorized (boundary condition) |
| ANA-E03 | Candidate with no career data | 1. Candidate parsed but careers=[] | Categorized as "신입" or handled gracefully |
| ANA-E04 | Overlapping career periods | 1. Candidate worked 2 jobs simultaneously | Merged correctly, not double-counted |
| ANA-E05 | Future-dated career entries | 1. Resume with end_date in future (current job) | Calculated to today's date, not future |
| ANA-E06 | All candidates in single tier | 1. All candidates are 시니어 | Chart displays correctly with single bar at 100% |
| ANA-E07 | Timezone boundary for monthly count | 1. Upload at 11:59 PM KST on month end | Correctly attributed to current or next month |
| ANA-E08 | Blind exports at limit | 1. Starter plan at 30 exports 2. View count | Shows 30/30 or "limit reached" indicator |
| ANA-E09 | Analytics refresh during data load | 1. Rapidly refresh page | No race conditions, consistent data |
| ANA-E10 | Chart responsiveness on mobile | 1. View analytics on mobile viewport | Chart scales appropriately, readable labels |

---

## 6. Settings

### Core Test Scenarios

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| SET-001 | View profile information | 1. Navigate to `/settings` | Display email (readonly), name, company fields |
| SET-002 | Update display name | 1. Change name field 2. Save | Name updated in DB, reflected across app |
| SET-003 | Update company name | 1. Change company field 2. Save | Company updated, saved successfully toast |
| SET-004 | View current plan | 1. Go to Subscription tab | Shows current plan (Starter/Pro) with details |
| SET-005 | View credit usage | 1. Check usage display | Shows "{used}/{total}" with progress bar |
| SET-006 | View remaining credits | 1. Check remaining count | Accurate: total - used |
| SET-007 | Plan comparison display | 1. View plan cards | Starter and Pro side-by-side with features/pricing |
| SET-008 | Upgrade to Pro | 1. Click Pro plan 2. Complete Paddle checkout | Plan updated to Pro, credits adjusted |
| SET-009 | Cancel subscription | 1. As Pro user 2. Click cancel 3. Confirm | Subscription cancelled, prorated refund initiated |
| SET-010 | Logout from settings | 1. Click logout button | Session cleared, redirect to homepage |
| SET-011 | Checkout success handling | 1. Complete upgrade 2. Land on `/settings?checkout=success` | Success toast displayed, plan reflected |
| SET-012 | Email display (readonly) | 1. Try to edit email | Field is disabled/readonly |
| SET-013 | Tab navigation | 1. Click between Profile/Subscription tabs | Content switches without page reload |
| SET-014 | Credit overage cost display | 1. View plan details | Shows overage rate (1,500원 or 1,000원/credit) |
| SET-015 | Blind export limit display | 1. View plan features | Shows 30/month for Starter, Unlimited for Pro |

### Edge Cases

| ID | Edge Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| SET-E01 | Name with maximum length | 1. Enter 100+ character name | Validation or truncation at limit |
| SET-E02 | Name with only spaces | 1. Enter "   " as name 2. Save | Error: "Name cannot be empty" or trimmed |
| SET-E03 | Company with special characters | 1. Company: "삼성전자(주) - AI Lab" | Saved correctly without encoding issues |
| SET-E04 | Concurrent settings update | 1. Open settings in 2 tabs 2. Update in both 3. Save both | Last write wins, no data corruption |
| SET-E05 | Payment failure during upgrade | 1. Start upgrade 2. Payment fails (insufficient funds) | Error message, remain on Starter plan |
| SET-E06 | Cancel during trial period | 1. New Pro user 2. Cancel within trial | Full refund, reverted to Starter |
| SET-E07 | Settings page after session expiry | 1. Open settings 2. Session expires 3. Try to save | Redirect to login, preserve pending changes if possible |
| SET-E08 | Credits at exact limit (50/50) | 1. Use exactly all credits | Progress bar at 100%, upload blocked, upgrade CTA shown |
| SET-E09 | Credits over limit (overage state) | 1. Plan allows overage 2. Use 52/50 credits | Shows overage state, overage charges displayed |
| SET-E10 | Webhook failure for subscription update | 1. Complete payment 2. Paddle webhook fails | Retry mechanism, eventual consistency, support contact |

---

## Test Execution Checklist

### Pre-Conditions
- [ ] Test environment URL configured
- [ ] Test Google account credentials available
- [ ] Test data seeded (if required)
- [ ] Browser console monitoring enabled
- [ ] Network tab monitoring for API calls

### Environment Requirements
- Browsers: Chrome (latest), Firefox, Safari, Edge
- Viewports: Desktop (1920x1080), Tablet (768x1024), Mobile (375x812)
- Network: Standard, Slow 3G (for timeout tests)

### Test Data Requirements
| Data Type | Quantity | Notes |
|-----------|----------|-------|
| PDF Resumes | 50 | Various formats: Korean, English, mixed |
| DOCX Resumes | 20 | Word 2007+ format |
| HWP Resumes | 20 | Korean Hancom format |
| Corrupted files | 5 | For negative testing |
| Large files (>50MB) | 3 | For limit testing |

---

## Severity Definitions

| Severity | Definition | Example |
|----------|------------|---------|
| P0 - Critical | App unusable, data loss | Login completely broken |
| P1 - High | Major feature broken | Upload fails for all files |
| P2 - Medium | Feature partially broken | Search returns wrong results |
| P3 - Low | Minor issue, workaround exists | UI alignment off by pixels |
| P4 - Cosmetic | Visual only | Typo in button text |

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Dev Lead | | | |
| Product Owner | | | |

