# DESIGN.md
### Academic Certificate Verification System (ACVS) - République Démocratique du Congo
### Ministère de l'Éducation Nationale et Nouvelle Citoyenneté

> A plain-text design system for AI coding agents. Every token, rule, and pattern in this
> document is derived from one of three sources: the project proposal (Divin Mundele Bibamu,
> Catholic University of Eastern Africa), the official Ministry seal, or the Ministry's published
> strategic priorities (edu-nc.gouv.cd/ministry). Where a decision is a *recommendation* rather
> than something stated in the source material, it is marked **[Proposed]**. Nothing in this
> document is a placeholder.

---

## 0. Product Context

**What this is.** A web-based platform where authorized educational institutions register
academic certificates, and anyone - an employer, another institution, the certificate holder -
verifies a certificate's authenticity by entering its ID number or scanning its QR code. No
login is required to verify. The source proposal is explicit that this system does not create
certificates; it creates the identification numbers and QR codes that get linked to
certificates already issued on paper.

**Why it exists.** The proposal's problem statement is direct: certificate verification in DRC
is manual, slow, and forgeable. A graduate's certificate currently gets confirmed by phone call
or physical visit to the issuing institution, a process that can take weeks and still fails to
catch fraud. This isn't a hypothetical - it maps onto two of the Ministry's own six published
strategic priorities: **#4, "Modernise the education system"** (integrate ICT into teaching and
school administration) and **#6, "Improve governance and resource management"** (run the system
transparently, based on reliable data). The design should read as an instrument of those two
mandates, not as a blockchain product that happens to be about certificates.

**The one fact that should organize everything.** A certificate record has two lives in this
system, and the difference between them is the entire point of the product:

1. **Grace period** - the record sits in PostgreSQL. It is editable. An institution can correct
   a typo, a wrong date, a misspelled name.
2. **Anchored** - once the grace period expires, the system computes a cryptographic hash and
   writes it to an Ethereum smart contract. It is now permanent. Nothing can silently change it.
   If an institution needs to invalidate it, the record isn't deleted - it is marked
   **Disabled**, and that mark is itself permanent and visible.

Every screen, badge, and interaction pattern in this document exists to make that one
distinction - *correctable* vs. *sealed* - instantly legible to a non-technical registrar and a
skeptical employer alike. That is the product's native shape: not a dashboard, not a catalog,
but a **one-way lifecycle with a visible point of no return.**

**Who uses it** (the proposal's own stakeholder list - nothing added):
- **Registrars / institutional staff** - register certificates, correct records during grace period
- **ICT staff** at institutions - technical administration
- **Students / graduates** - hold and reference their own certificates
- **Employers** - verify a certificate presented to them
- **The general public** - anyone else with a certificate ID or QR code
- **System administrators** - oversee the platform across institutions

**Product naming.** The source material gives no brand name or tagline; only the descriptive
academic title, "Academic Certificate Verification System," used throughout as ACVS. This
document does not invent one. Use **ACVS** (English contexts) or the literal French descriptor
**Système de Vérification des Certificats Académiques (SVCA)** until the institution names it.

---

## 1. Visual Theme & Atmosphere

**Mood:** civic, sober, official - the visual register of a government seal, not a startup. This
is infrastructure carrying the Ministry's authority; it should feel closer to a passport office
than a crypto dashboard. Blockchain is the mechanism, not the message. A registrar in Kinshasa
or Lubumbashi should recognize this as *belonging to the Ministry* before they recognize it as
software.

**Density:** Low-to-medium. The proposal's own risk analysis flags poor rural internet
connectivity and limited end-user technical literacy as real constraints (Section 4.4.4). Dense,
cluttered UI compounds both problems. Every screen should have one clear job.

**Design philosophy:** Trust is manufactured through *restraint and legibility*, not through
decoration. A forged certificate looks confident too - this system earns credibility by being
plain, consistent, and unambiguous about what state a record is in, every time.

**Signature element - the Seal Moment.** The Ministry's own emblem is literally a seal: a
circular stamp with a national motto around its rim. The product's core technical event -
grace-period record becomes cryptographically anchored - is functionally a seal being struck.
This document uses that correspondence deliberately: the moment a certificate transitions from
*editable* to *anchored* is the one place in the product that gets a considered, slightly
ceremonial visual treatment (see §5, Anchoring Confirmation). Everywhere else, restraint. Spend
the one accessory here and nowhere else.

---

## 2. Color Palette & Roles

Source: the official Ministry seal (attached), which uses the DRC national flag's sky blue,
yellow, and red as vertical brand bars alongside a black-and-white circular seal. **[Proposed]**
hex values below are standard sRGB approximations of the DRC flag colors as reproduced in the
seal; before production use, confirm exact values against the Ministry's official brand
guidelines if one exists - none was included in the source material.

| Token | Hex | Role |
|---|---|---|
| `--congo-blue` | `#007FFF` | Primary brand bar (from seal). Institutional chrome: header bar, primary navigation, primary buttons on public-facing screens. |
| `--congo-yellow` | `#F7D618` | Secondary brand bar (from seal). Used sparingly - dividers between blue and red bars, small accent marks. Never as a text color (fails contrast). |
| `--congo-red` | `#CE1021` | Tertiary brand bar (from seal). Reserved for the **Disabled/Revoked** certificate state and destructive actions only - never decorative, so its appearance always means "attention." |
| `--seal-black` | `#1A1A1A` | Wordmark, seal linework, body text. Matches the near-black used in the Ministry's own uppercase lockup. |
| `--paper-white` | `#FFFFFF` | Primary background. Matches the seal's white ground - the product should feel printed on official paper, not floating on a gradient. |
| `--slate-100` | `#F4F5F7` | Secondary surface - cards, table zebra striping, form backgrounds. |
| `--slate-500` | `#6B7280` | Secondary text, timestamps, metadata. |

**Semantic lifecycle colors** - these carry the product's core meaning and are distinct from the
brand palette above, so the two systems never compete for attention:

| Token | Hex | Meaning |
|---|---|---|
| `--state-grace` | `#B45309` (amber-700) | **Grace period.** Editable, not yet permanent. Warm amber signals "still changeable" - deliberately *not* red, which is reserved for revocation. |
| `--state-anchored` | `#065F46` (emerald-800) | **Anchored on-chain.** Verified, immutable, trustworthy. Deep green, not the brand blue - this is a trust signal distinct from Ministry chrome. |
| `--state-disabled` | `--congo-red` `#CE1021` | **Disabled/Revoked.** Uses the reserved red directly - the one state where brand red and semantic red are the same token, reinforcing that this is a serious, rare, official act. |
| `--state-not-found` | `#4B5563` | Neutral gray. A certificate ID that returns no match is not an error or a danger - it's simply information. Never render "not found" in red; that overstates the case and could read as an accusation. |

**Rule:** `--congo-yellow` never appears in a status badge. It is Ministry branding, not
product state - conflating the two would make the yellow bar look like a lifecycle warning,
which it isn't.

---

## 3. Typography Rules

The Ministry wordmark (from the seal) is a bold, tightly tracked, stacked uppercase sans-serif -
three lines, left-aligned, no ornamentation. That instructs the display face directly.

| Role | Face | Weight | Notes |
|---|---|---|---|
| Display / Ministry lockup | A grotesque sans (e.g., Inter, Helvetica Neue, or Arial Black stack) | 700~800 | Set in uppercase, tight tracking (-0.01em), matching the seal's own three-line stacked wordmark treatment. Used only for the institutional header, never for product copy. |
| UI headings | Same grotesque family | 600 | Sentence case, not uppercase - uppercase is reserved for the Ministry lockup so it keeps its distinct authority. |
| Body text | Same grotesque family or a paired humanist sans | 400 | Optimized for legibility at small sizes on low-end Android devices, which the proposal names explicitly as a target test device (smartphones for QR testing, Section 4.4.1). |
| Data / certificate IDs / hashes | A monospace face (e.g., IBM Plex Mono, Roboto Mono) | 500 | Certificate ID numbers, transaction hashes, and blockchain addresses are always monospace - this is a data-integrity signal, not a stylistic choice. A registrar or employer should be able to visually compare two IDs character-by-character. |

**Type scale [Proposed]:**

```
--text-xs:   0.75rem  (12px)  — timestamps, hash fragments
--text-sm:   0.875rem (14px)  — metadata, table body
--text-base: 1rem     (16px)  — body copy, form inputs (never smaller, per accessibility)
--text-lg:   1.25rem  (20px)  — card titles
--text-xl:   1.75rem  (28px)  — section headings
--text-2xl:  2.25rem  (36px)  — page titles, Ministry lockup
```

---

## 4. The Native Shape: Information Architecture

Per the brief: let the product's real shape organize the page rather than a generic section
template. This product has two distinct shapes, not one, and they should not be visually
conflated:

**A. The Lifecycle (institution-facing).** A certificate record moves through exactly three
states, always left to right, always in this order. This is a pipeline, not a list, and should
be drawn as one:

```
[ REGISTERED ]  →  [ GRACE PERIOD ]  →  [ ANCHORED ]  →  ( optional: [ DISABLED ] )
   institution         editable            immutable         flagged, permanent
   submits record       in Postgres          on Ethereum        on-chain
```

Registrar-facing screens (registration, correction, institution dashboard) should always show
where a given record sits on this line. A progress-rail or stepper component, not a status pill
buried in a table cell, is the correct pattern here - this is the one place a numbered/staged UI
device is actually justified, because the content genuinely is a fixed, ordered sequence
(per the proposal's hybrid DB architecture, Section 3.5).

**B. The Query (public-facing).** Verification is not a pipeline - it is a single, stateless
lookup: input → match. This should be the *simplest possible screen in the product*: one field
(certificate ID or QR scan), one action, one of three results (Valid / Disabled / Not Found).
Resist the urge to add navigation chrome, institutional branding density, or secondary content
to this screen - per the proposal's own objective #3 ("user-friendly interface... for the public
and authorized users"), and the connectivity constraints in §4.4.4, this screen should load and
resolve fast on a low-end phone with a weak connection.

These two shapes should feel like different rooms in the same building - same materials
(color, type), different floor plans. Don't force the public verification screen into the same
dashboard chrome as the registrar tools; that adds weight to the one screen that most needs to
stay light.

---

## 5. Component Stylings

### Status badge (the lifecycle, compressed to one component)
Pill shape, `--text-sm`, 500 weight, colored dot + label, using the semantic tokens from §2 -
never the brand blue/yellow/red for this component.
- `● Grace Period` - amber dot, amber-tinted background at 10% opacity
- `● Anchored` - emerald dot, emerald-tinted background at 10% opacity
- `● Disabled` - red dot, solid red text (this state should read as more emphatic than the other
  two - heavier weight is appropriate here specifically)

### Anchoring Confirmation (the Signature Element, §1)
The one moment of visual ceremony in the product. When a record is anchored, the confirmation
view should echo the Ministry seal's own circular form - a simple radial/stamp motif around the
"Anchored" badge and the resulting hash, rendered once, not animated repeatedly or reused
elsewhere. This is the single accessory this product wears; per the frontend-design principle of
restraint, it should not be echoed in navigation icons, loading states, or marketing copy.

### Certificate ID / Hash display
Monospace, `--slate-100` background, generous horizontal padding, a copy-to-clipboard affordance.
Always shown in full - never truncated with an ellipsis, since the entire value of the ID is
that it can be checked character-for-character.

### QR verification entry point
A large, high-contrast scan target, minimum 44×44px touch area (exceeds typical mobile minimums
deliberately, given the proposal's target users skew toward first-time/non-technical usage). A
manual ID-entry fallback is always visible alongside it, never hidden behind a toggle - per the
connectivity risk noted in the proposal, camera/QR access may not always be reliable.

### Institution table / registrar dashboard
Zebra-striped rows on `--slate-100`, status badge as the first column (not the last) so lifecycle
state is scannable before any other detail. Sort/filter by lifecycle state, not just by name or
date - this is the axis registrars actually think in.

### Forms (registration, correction during grace period)
Every field that becomes immutable at anchoring should carry a small persistent note - "Editable
until grace period ends" - directly beneath it. Don't let a registrar discover permanence after
the fact. This is a direct, low-cost way to prevent the exact error the proposal's grace-period
design exists to guard against.

### Buttons
- Primary action: `--congo-blue`, white text, `--text-base`, 600 weight, 8px radius **[Proposed]**
- Destructive action (disable/revoke a certificate): `--congo-red` outline, filled only on a
  confirmation step - disabling a certificate is a permanent, official act and should never be a
  single accidental click
- Secondary: `--seal-black` outline on `--paper-white`

---

## 6. Layout Principles

**Spacing scale [Proposed]** (4px base unit, matches the type scale's rhythm):
```
--space-1: 4px   --space-2: 8px   --space-3: 12px  --space-4: 16px
--space-6: 24px  --space-8: 32px  --space-12: 48px --space-16: 64px
```

**Grid:** 12-column on desktop, single-column stack under 768px. The public verification screen
(§4B) ignores the 12-column grid entirely and centers a single narrow column (max 480px) - it
should never feel like it's occupying a dashboard shell.

**Header:** The Ministry lockup (seal + three-line wordmark, per the source image) sits in the
header on every institutional and administrative screen - reinforcing that this is a government
system, not a third-party product, at every step a registrar takes. On the public verification
screen, the lockup appears once, small, above the single input field - present, but not
competing with the one thing the visitor came to do.

**Whitespace:** Generous around the status badge and lifecycle stepper specifically - these are
the components carrying the most meaning, and crowding them undercuts their legibility.

---

## 7. Depth & Elevation

Flat by default - matches the "printed official document" atmosphere from §1. Elevation is used
sparingly and only to indicate something is temporarily editable or interactive, reinforcing the
grace-period/anchored distinction at a purely tactile level:

- **Grace-period records**: subtle 1px border + very light shadow (`0 1px 2px rgba(0,0,0,0.05)`)
  - signals "this surface can still be touched"
- **Anchored records**: no shadow, flat, slightly heavier border-bottom rule - signals
  "settled, load-bearing, not floating"
- **Modals** (used only for destructive/irreversible confirmations, e.g. disabling a
  certificate): the only place a heavier shadow (`0 8px 24px rgba(0,0,0,0.12)`) appears in the
  system - reserving strong elevation for the moments that deserve the user's full attention.

---

## 8. Do's and Don'ts

**Do:**
- Show lifecycle state before any other metadata, everywhere a certificate appears
- Keep the public verification flow to one screen, one field, one action
- Use monospace exclusively for IDs, hashes, and addresses
- Reserve `--congo-red` for Disabled/Revoked and destructive actions only
- Confirm destructive actions with an explicit second step

**Don't:**
- Don't use blockchain/crypto visual tropes (glowing nodes, chain-link icons, neon gradients) -
  the proposal's own literature review (§2.5–2.6) frames this product's differentiator as
  accessibility and public trust for a developing-nation context, not technical novelty. Looking
  like a crypto product undermines that.
- Don't let the Ministry brand bars (blue/yellow/red) double as status colors - keep brand and
  state visually separate (§2)
- Don't animate the Anchoring Confirmation motif anywhere else in the product - it loses meaning
  if it becomes decorative
- Don't hide the manual certificate-ID entry behind the QR scanner - connectivity and camera
  access aren't guaranteed (§4.4.4 of the source proposal)
- Don't add uppercase styling to anything except the literal Ministry lockup - uppercase is
  reserved, not a general heading style

---

## 9. Responsive Behavior

Given the proposal's own named constraint - poor internet connectivity in rural DRC and reliance
on smartphones for QR scanning (Section 4.4.1, 4.4.4) - mobile is not a breakpoint to accommodate,
it is close to the primary target for the public verification flow specifically.

- **Breakpoints [Proposed]:** 480px (mobile), 768px (tablet), 1024px (desktop)
- **Touch targets:** minimum 44×44px throughout, 48×48px on the QR scan entry point specifically
- **Public verification screen:** designed mobile-first; desktop is the adapted case, not the
  reverse
- **Registrar/admin dashboards:** designed desktop-first (institutional staff working at a
  workstation, per the proposal's hardware resource section, 4.4.1), gracefully collapsing the
  12-column grid to a single column on smaller viewports
- **Low-bandwidth consideration [Proposed]:** the verification result screen should render its
  Valid/Disabled/Not Found state from a minimal payload - status, ID, issuing institution, date -
  before any secondary detail loads, so a result is legible even on a slow connection

---

## 10. Agent Prompt Guide

**Quick reference:**
```
Brand:     --congo-blue #007FFF · --congo-yellow #F7D618 · --congo-red #CE1021
           --seal-black #1A1A1A · --paper-white #FFFFFF
State:     --state-grace #B45309 · --state-anchored #065F46 · --state-disabled #CE1021
Type:      Grotesque sans (headings/body) + monospace (IDs/hashes only)
Shape:     Lifecycle = pipeline/stepper. Verification = single stateless lookup. Never merge them.
Signature: The Anchoring Confirmation "seal" moment - used once, not decoratively repeated.
```

**Ready-to-use prompts:**

> "Build the public certificate verification screen: single centered column, max 480px, Ministry
> lockup small at top, one input field accepting either a certificate ID or QR scan, one primary
> button in `--congo-blue`. Result renders as a status badge using the semantic state tokens,
> never the brand palette."

> "Build the registrar's certificate registration form: 12-column desktop layout, Ministry
> header bar in full lockup, lifecycle stepper showing 'Registered → Grace Period' as the current
> position, and a persistent 'Editable until grace period ends' note under every field that
> becomes immutable at anchoring."

> "Build the Anchoring Confirmation view: the one screen in the product that uses the radial seal
> motif described in §5. Shows the resulting hash in monospace, full length, with copy-to-
> clipboard. This treatment appears nowhere else in the product."

---

## Sources & Grounding

- **Divin Mundele Bibamu**, *Design and Implementation of an Academic Certificate Verification
  System for Multi-Level Educational Institutions in DRC*, Project Proposal, Catholic University
  of Eastern Africa, February 2026 - entities, lifecycle architecture, stakeholders, objectives,
  scope, and risk constraints.
- Official seal, **Ministère de l'Éducation Nationale et Nouvelle Citoyenneté**, République
  Démocratique du Congo - color bars, wordmark treatment, national motto.
- **edu-nc.gouv.cd/ministry** - six strategic priorities, hotline (178, Allo École).
- **VoltAgent/awesome-design-md** (github.com/voltagent/awesome-design-md) - the nine-section
  DESIGN.md specification this document follows.

Items marked **[Proposed]** are design recommendations built on top of the above, not values
stated directly in the source material - flagged so they're easy to revise or replace once real
brand guidelines or user research exist.
