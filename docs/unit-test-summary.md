# TriggerMap — Unit Test Summary

**Framework:** Vitest v4.1.4  
**Total Tests:** 407  
**Test Suites:** 21  
**Run command:** `npm test`

---

## Shared Constants

### 1. `shared/constants/__tests__/emotions.test.js` — 31 tests

**EMOTIONS**
- contains the 5 core emotions

**EMOTION_SCORE**
- maps every core emotion to a numeric score
- scores range from 1 (worst) to 5 (best)
- includes derived-label safety-net mappings

**ENERGY_MAP**
- maps every core emotion to an energy string
- maps derived labels as well

**EMOTION_AXIS_STEPS**
- has exactly 5 steps from -1 to 1

**createEmotionCoordinates**
- snaps feel and energy to nearest axis steps
- returns exact steps when input is already on a step
- computes intensity as normalized magnitude (0-1)
- returns intensity 0 at origin
- snaps extreme out-of-range values to nearest step
- returns intensity ≤ 1 for all axis-aligned inputs

**emotionRegionKey**
- returns correct region for strong positive valence + high arousal
- returns correct region for strong negative valence + low arousal
- returns neutral_mid for center of the circumplex
- treats values in the dead zone (-0.15 to 0.15) as neutral/mid
- covers all 9 regions

**derivedEmotionLabel**
- returns "neutral" for near-zero magnitude
- returns "overwhelmed" for strong negative + high arousal
- returns "anxious" for moderate negative + high arousal
- returns "excited" for strong positive + high arousal
- returns "peaceful" for strong positive + low arousal
- returns "heavy" for strong negative + low arousal
- returns "calm" for moderate positive + low arousal
- returns "low" for moderate negative + low arousal
- returns "restless" for strong neutral-valence + high arousal
- returns "disconnected" for strong neutral-valence + low arousal

**legacyToCoordinates**
- maps all 5 core emotions to coordinates
- returns neutral coordinates for unknown emotion
- returns specific coordinates for calm

---

### 2. `shared/constants/__tests__/tags.test.js` — 6 tests

**MAX_TAGS_PER_MOMENT**
- is 3

**REGION_TAGS**
- covers all 9 emotion regions
- has no extra unexpected regions
- every region has at least 5 tags
- all tags are non-empty strings
- region keys match emotionRegionKey output format

---

### 3. `shared/constants/__tests__/triggers.test.js` — 7 tests

**TRIGGERS**
- contains 9 trigger categories
- includes known triggers
- all entries are non-empty strings

**TRIGGER_KEYWORDS**
- has a keyword list for every trigger
- has no extra keys beyond TRIGGERS
- all keywords are non-empty strings
- each trigger has its own name in its keywords

---

### 4. `shared/constants/__tests__/coordinatesToLegacy.test.js` — 20 tests

**coordinatesToLegacy**
- maps (0, 0) to neutral
- maps small magnitude (<0.25) to neutral
- maps negative valence + high arousal (≥0.7) to anxious
- maps negative valence + low arousal (<0.7) to frustrated
- maps positive valence + non-negative arousal to energized
- maps positive valence + negative arousal to calm
- maps exact boundary valence=-0.2 to anxious/frustrated zone
- maps exact boundary valence=0.2 to positive zone
- maps valence ~0.15 to energized/calm based on arousal
- maps near-zero valence + positive arousal to anxious
- maps near-zero valence + negative arousal to frustrated
- handles extreme coordinates
- can produce all 5 legacy emotions
- always returns one of the 5 valid emotions

**emotionSignalKeywords**
- returns array of keywords
- returns anxious-related keywords for bad+high
- returns calm-related keywords for good+low
- returns neutral keywords for center
- returns different keywords for different regions

**emotionRegionKey**
- maps to 9 distinct regions

---

## Shared Knowledge

### 5. `shared/knowledge/__tests__/movementLibrary.test.js` — 17 tests

**constants**
- MOVEMENTS is a non-empty array
- every movement has required fields
- MECHANISMS has expected keys
- ENVIRONMENTS has expected keys
- INTENSITY_LEVELS has 3 levels

**filterMovements**
- returns all movements with no filters
- filters by mechanism
- filters by environment
- filters by equipment
- filters by intensity
- filters by emotion tags
- filters by max duration
- combines multiple filters

**pickMovements**
- returns requested number of movements
- excludes specified IDs
- filters by environment
- returns from full pool when no candidates after exclusion

---

### 6. `shared/knowledge/__tests__/nourishmentLibrary.test.js` — 15 tests

**constants**
- NOURISHMENTS is a non-empty array
- every nourishment has required fields
- FOOD_TYPES has expected keys
- DIETS has expected keys
- PREP_LEVELS has 3 levels

**filterNourishments**
- returns all nourishments with no filters
- filters by type
- filters by diet
- nonVeg diet returns all items (no diet filter)
- filters by cuisine
- filters by prep level
- filters by emotion tags

**pickNourishments**
- returns requested count
- excludes specified IDs
- respects diet filter

---

## Backend Utilities

### 7. `backend/utils/__tests__/textGrammar.test.js` — 39 tests

**emotionNoun**
- converts "anxious" → "anxiety"
- converts "frustrated" → "frustration"
- converts "calm" → "calmness"
- converts "energized" → "energy"
- converts "neutral" → "a neutral state"
- is case-insensitive
- returns unknown emotion as-is
- handles null/undefined gracefully

**triggerLabel**
- converts "alone" → "time alone"
- converts "social" → "social life"
- returns unknown trigger as-is
- handles null gracefully

**cap**
- capitalizes first letter
- handles single character
- returns falsy values as-is
- does not change already-capitalized strings

**lintText**
- fixes "leads to anxious" → "leads to feeling anxious"
- does not double-fix "leads to feeling anxious"
- fixes "brings frustrated" → "leads to feeling frustrated"
- fixes "bringing anxious" → "leaving you feeling anxious"
- fixes "source of anxious" → "source of anxiety"
- fixes "source of frustrated" → "source of frustration"
- replaces bare "alone" with "time alone"
- capitalizes "time alone" at sentence start
- fixes "tend to bounces" → "tend to bounce"
- fixes "tend to recovers" → "tend to recover"
- fixes "You's" → "Your"
- fixes lowercase "you's" → "your"
- removes garbled tokens like "exer0376fing"
- replaces "exergy" with "energy"
- replaces "entropy" with "variation"
- replaces "equilibrium" with "balance"
- replaces "catalyst" with "trigger"
- replaces conjugated forms: "amplifies" → "increases"
- replaces conjugated forms: "optimized" → "improved"
- replaces "exacerbated" → "worsened"
- returns null/undefined as-is
- returns non-string as-is
- handles empty string

---

### 8. `backend/utils/__tests__/phrasingLayer.test.js` — 16 tests

**extractFirstName**
- extracts first name from full name
- handles single name
- returns null for null/undefined/empty
- returns null for system placeholder names
- returns null for single-char names
- trims whitespace

**phraseText**
- returns empty string for null input
- returns empty string for empty input
- applies grammar lint (banned vocab)
- normalizes unicode dashes
- removes markdown bold markers
- removes zero-width characters
- collapses multiple spaces
- personalizes with firstName
- does not personalize without firstName

**phraseTexts**
- processes array of texts

---

### 9. `backend/utils/__tests__/sanitizeOutput.test.js` — 13 tests

**sanitizeDeep**
- replaces em dashes with spaced hyphens
- replaces en dashes with spaced hyphens
- normalizes smart quotes
- removes zero-width characters
- removes control characters
- removes markdown bold markers
- removes markdown headers
- collapses multiple spaces
- collapses excess newlines
- trims whitespace
- sanitizes nested objects
- sanitizes arrays
- passes through numbers and booleans

---

## Backend AI

### 10. `backend/ai/__tests__/signalProfile.test.js` — 36 tests

**buildSignalProfile — volatility**
- classifies low volatility (< 0.3)
- classifies moderate volatility (0.3 – 0.8)
- classifies high volatility (≥ 0.8)
- classifies null volatility as low

**buildSignalProfile — drift**
- classifies positive drift
- classifies neutral drift
- classifies slight negative drift
- classifies strong negative drift
- classifies missing drift as neutral

**buildSignalProfile — triggerStrength**
- returns "none" when no friction/regulators
- returns "weak" for 1 pairing with low count
- returns "strong" for ≥3 pairings with max count ≥4
- returns "moderate" for in-between cases

**buildSignalProfile — intensity**
- returns "subtle" for low volatility + neutral drift + non-strong triggers
- returns "strong" for high volatility
- returns "strong" for strong negative drift
- returns "moderate" for moderate volatility + neutral drift

**buildSignalProfile — weeklySlope**
- returns "flat" when trajectory has < 3 entries
- returns "declining" for large drop
- returns "rising" for large increase
- returns "flat" for stable trajectory

**buildSignalProfile — isFlattening**
- detects flattening: low volatility + high neutral ratio + decline
- not flattening with moderate volatility

**buildSignalProfile — invoked metrics**
- classifies strong negative vacuum drift
- classifies positive vacuum drift
- detects masking level
- detects residue contamination

**buildSignalProfile — compound patterns**
- reports falseRecovery from compound patterns
- reports crashRisk from compound patterns

**buildSignalProfile**
- returns all expected keys

**buildSignalConstraints**
- returns a non-empty string
- includes signal profile intensity line
- adds low volatility constraint
- adds flattening constraint when detected
- adds vacuum state constraint for strong negative vacuum drift
- adds crash risk constraint

---

### 11. `backend/ai/__tests__/styleProfiles.test.js` — 18 tests

**STYLE_IDS**
- contains all 11 style profiles
- includes expected styles

**STYLE_OPTIONS**
- includes default as first option
- has 12 total options (default + 11 styles)
- every option has id and label

**getStylePrompt**
- returns empty string for default style
- returns empty string for null/undefined
- returns empty string for unknown style
- returns non-empty prompt for valid style
- includes VOICE STYLE header
- includes vocabulary section
- includes anti-patterns section
- includes examples

**validateStyle**
- returns passthrough for default style
- returns passthrough for null style
- strips anti-pattern words
- scores style adherence based on vocabulary
- warns on low style adherence

---

### 12. `backend/ai/__tests__/generateInsight.test.js` — 23 tests

**generateInsight**
- returns too_early summary for too_early confidence
- returns stale summary for stale confidence
- returns low summary for low confidence
- returns emerging summary for emerging confidence
- returns moderate summary for moderate confidence
- returns strong summary for strong confidence
- returns all expected fields
- model is rule-based-v4
- generatedAt is a valid ISO timestamp
- returns a micro experiment for non-too_early confidence
- whatWorking includes regulators
- whereToFocus includes friction zones
- drivers lists top triggers with effects
- behavioral loop includes friction and/or regulator
- returns Hindi summary when lang=hi
- includes baseline summary when baseline is reliable
- baseline summary is null when baseline is unreliable
- appends tag context when tags have count ≥ 2
- does not append tag context when tag count < 2
- strong summary mentions top trigger
- handles report with no regulators or friction
- handles empty emotion frequency
- actionableDirection is a string or null

---

## Backend Knowledge

### 13. `backend/knowledge/__tests__/ragEngine.test.js` — 12 tests

**retrieveForLLM**
- returns empty string for null report
- returns a string starting with CONTEXTUAL KNOWLEDGE header
- includes domain labels in output
- returns fewer/no chunks for a minimal report
- respects maxChunks parameter

**retrieveForRuleBased**
- returns { interpretations, framing } for null report
- returns interpretations with id, content, score
- filters to interpretation and framing domains only

**retrieveForMode**
- returns empty string for null report
- returns string starting with "Emotional context knowledge"

**retrieveIntervention**
- returns null for null report
- returns a string (intervention content) for a matching report

---

## Backend Services

### 14. `backend/services/__tests__/emotionDecomposer.test.js` — 13 tests

**computeEvokedScore**
- computes weighted average from correlations
- returns 3.0 (neutral) for unknown trigger
- returns 3.0 for empty correlations

**computeInvokedScore**
- returns positive when actual > evoked
- returns negative when actual < evoked
- returns 0 when actual equals evoked

**computeDailyInvoked**
- groups moments by day and computes mean invoked
- returns empty array for empty moments

**computeResidue**
- returns 0 residue for single moment
- computes non-zero residue for subsequent moments
- residue decays over time

**detectContamination**
- returns empty for single moment per day
- detects cross-trigger contamination within a day

---

### 15. `backend/services/__tests__/vacuumStateEngine.test.js` — 21 tests

**computeVacuumState**
- returns baseline + invoked when no previous vacuum
- smooths toward invoked with alpha
- returns baseline when invoked is 0 and vacuum equals baseline

**computeVacuumTrajectory**
- computes trajectory across multiple days
- returns empty for empty input

**computeBehavioralInstability**
- returns 0 for empty snapshot
- returns higher instability for frequency deviation

**computeMaskingCoefficient**
- returns 0 when reported drift exceeds instability
- returns positive when instability exceeds reported drift
- never returns negative

**computeWeeklyMasking**
- returns none for insufficient data
- returns structured result with coefficient and level

**detectFalseRecovery**
- detects false recovery: surface near baseline but vacuum depressed
- returns false when vacuum is near baseline
- returns false when stability is high
- returns false when surface far from baseline
- returns false for null stability

**detectCrashRisk**
- detects crash risk: positive surface + declining vacuum + masking
- returns false with insufficient days
- returns false when surface is low
- returns false when masking is low

---

### 16. `backend/services/__tests__/baselineEngine.test.js` — 8 tests

**computeBaselineMetrics**
- returns structured result with all expected keys
- marks baseline as unreliable with < 5 logged days
- marks baseline as reliable with ≥ 5 logged days
- detects stable drift for consistent emotions
- detects improving drift when recent days are better
- computes stability score between 0 and 1
- returns stateOfMind label
- handles all-empty aggregates gracefully

---

### 17. `backend/services/__tests__/aggregationService.test.js` — 24 tests

**formatAggregateDate**
- formats a Date object to YYYY-MM-DD
- formats a timestamp string
- formats a numeric timestamp
- defaults to today when no argument
- returns exactly 10 characters

**bucketForTimestamp**
- maps midnight (0:00) to night
- maps 5:59 AM to night
- maps 6:00 AM to morning
- maps 11:59 AM to morning
- maps noon (12:00) to afternoon
- maps 5:59 PM to afternoon
- maps 6:00 PM to evening
- maps 11:59 PM to evening
- handles all 24 hours

**parseAggregateHash**
- returns structured snapshot from empty record
- parses trigger counts
- parses emotion counts
- parses pair counts
- parses time-of-day counts
- parses tag counts
- parses valence/arousal sums scaled by 1000
- handles total correctly
- handles negative valence_sum
- handles mixed record with all field types

---

### 18. `backend/services/__tests__/momentService.test.js` — 24 tests

**createMomentPayload**
- returns all required fields
- generates unique IDs
- accepts valid trigger
- falls back to 'work' for invalid trigger with empty note
- detects trigger from note when trigger is invalid
- all valid triggers are accepted
- accepts valid emotion string
- falls back to neutral for invalid emotion string
- maps valid emotion to its coordinates
- uses coordinatesToLegacy when valence/arousal provided
- prefers continuous model over legacy emotion when both present
- ignores valence/arousal if only one is provided
- uses provided intensity when given
- computes intensity from coordinates when not provided
- uses occurredAt when provided
- defaults to current time when occurredAt not provided
- includes tags when provided
- omits tags field when not provided
- omits tags field when empty array
- defaults isAnonymous to false
- sets isAnonymous from input
- sets derivedLabel from continuous model
- sets derivedLabel to emotion for legacy model
- defaults note to empty string when not provided

---

### 19. `backend/services/__tests__/progressEngine.test.js` — 13 tests

**computeProgressMetrics**
- returns null for insufficient data (< 10 aggregates)
- returns null when fewer than 2 active weekly snapshots
- returns structured result for valid data (14 days)
- trajectory includes past, present, change, direction
- detects improving direction when scores rise over weeks
- detects declining direction when scores fall over weeks
- metrics include stability, volatility, drift, recoveryDays
- patternShifts has all four categories
- detects emerging patterns (new pairs with count ≥ 2)
- dataQuality includes weeksAvailable and confidence
- attributions are returned (may be empty)

**computePilotMetrics**
- handles empty user list
- returns structured result

---

### 20. `backend/services/__tests__/patternEngine.test.js` — 27 tests

**generateWeeklyReport**
- returns structured report for empty input
- returns too_early confidence for < 3 moments
- returns low confidence for 3-4 moments
- returns stale confidence when silenceWindow is set
- counts trigger frequencies correctly
- counts emotion frequencies correctly
- sums total moments across all days
- counts pair frequencies via topPair
- identifies dominant trigger
- returns null topTrigger when tied
- detects regulators (high emotion score pairs)
- detects friction zones (low emotion score pairs)
- requires MIN_PAIR_REPEATS (2) for regulators/friction
- computes weekly centroid from valence/arousal sums
- centroid is null when no continuous data
- computes centroid drift over the week
- computes volatility score
- low volatility for uniform emotions
- generates trajectory note with enough data
- computes weekly deltas when previous aggregates provided
- returns null deltas when no previous aggregates
- counts tag frequencies
- counts time-of-day patterns
- counts only days with actual moments for daysLogged
- reaches strong confidence with 15+ moments and 5+ days
- reaches moderate confidence with 8-14 moments on 3-4 days
- reaches emerging confidence with 5-7 moments on 2 days

---

### 21. `backend/services/__tests__/actionEngine.test.js` — 24 tests

**generateActions**
- returns empty array for null report
- returns empty array for < 3 moments (non-silent)
- returns exactly 3 actions for valid report
- each action has required fields
- action types are valid
- generates regulate action pairing friction with regulator
- generates actions mentioning the friction trigger
- generates drift check-in when baseline declining
- generates rising trigger action when delta >= 2
- generates centroid action for activated-negative
- generates centroid action for heavy-negative
- generates centroid action for settled-positive
- filters out actions the user already responded to
- enhances helped actions into deeper follow-ups
- suppresses triggers from not_helpful feedback
- rotates action IDs every 3 feedback responses
- always returns 3 actions even for minimal report
- fallback actions have valid structure
- includes welcome-back action for silent users
- returns Hindi actions when lang=hi
- generates liked-trigger action from prefs
- mixes LLM actions into results when provided via prefs
- action IDs are unique
- actions have sequential order
