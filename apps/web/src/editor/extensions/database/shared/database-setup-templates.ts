import type { ColorTokenId } from "@/lib/color-tokens"

import { defaultStatusOptions } from "../constants"

export type DatabaseSetupTemplateId =
  | "tasks-tracker"
  | "projects"
  | "document-hub"
  | "content-calendar"
  | "meeting-notes"
  | "crm"

export type DatabaseSetupTemplateProperty = {
  config?: unknown
  name: string
  type: string
}

export type DatabaseSetupTemplateSampleRow = {
  content: string
  emoji: string
  title: string
  values: Record<string, string | string[]>
}

export type DatabaseSetupTemplate = {
  colorId: ColorTokenId
  emoji: string
  id: DatabaseSetupTemplateId
  name: string
  properties: DatabaseSetupTemplateProperty[]
  sampleRows: DatabaseSetupTemplateSampleRow[]
}

function getDefaultPropertyConfig(type: string) {
  if (type === "status") {
    return {
      defaultOptionId: defaultStatusOptions[0]?.id,
      options: defaultStatusOptions,
    }
  }

  return undefined
}

export const databaseSetupSuggestedTemplates: DatabaseSetupTemplate[] = [
  {
    colorId: "green",
    emoji: "✅",
    id: "tasks-tracker",
    name: "Tasks Tracker",
    properties: [
      { config: getDefaultPropertyConfig("status"), name: "Status", type: "status" },
      { name: "Date", type: "date" },
      { name: "Person", type: "person" },
    ],
    sampleRows: [
      {
        content: `# Draft project brief

## Summary
Create a one-page brief that explains the project direction, why it matters, and what decisions are needed before work begins.

## Goals
- Align stakeholders on the problem statement and success criteria
- Define the initial scope, assumptions, and measurable outcomes
- Capture non-goals so the team can avoid scope drift

## Draft outline
- Background and current pain points
- Target users and primary use cases
- Proposed approach and alternatives considered
- Timeline, owners, and dependencies

## Open questions
- Who is the final approver for scope changes?
- Which metrics will determine whether the project is successful?
- What risks should be escalated before planning starts?

## Next steps
- [x] Collect initial context
- [ ] Add success metrics
- [ ] Share with reviewers
- [ ] Convert feedback into implementation tasks`,
        emoji: "📝",
        title: "Draft project brief",
        values: { Date: "2026-07-03", Status: "In progress" },
      },
      {
        content: `# Review launch checklist

## Launch goal
Confirm that the product, communications, analytics, and support paths are ready before the release is announced.

## Readiness areas
- Product QA and regression testing
- Website, email, and in-app announcement copy
- Support macros and help center updates
- Analytics events and launch dashboard
- Rollback and escalation plan

## Known blockers
- Final screenshots need design approval
- Help article needs one more technical review
- Analytics dashboard needs owner confirmation

## Launch checklist
- [ ] Confirm final build is deployed to production
- [ ] Verify announcement links and UTM tags
- [ ] Send support team release notes
- [ ] Run smoke test on the production path
- [ ] Record launch decision in this page

> Use this row page as the handoff record for everyone involved in launch day.`,
        emoji: "🚦",
        title: "Review launch checklist",
        values: { Date: "2026-07-05", Status: "Not started" },
      },
      {
        content: `# Publish release notes

## What shipped
Write a concise summary of the release, the customer problem it solves, and the parts of the app that changed.

## Audience
- Existing customers who need to understand what changed
- Internal teams who need implementation and support context
- Prospects who may benefit from the new workflow

## Release note draft
- Headline: Improved database templates with richer starter content
- Summary: Users can create useful databases faster because templates now include rows, properties, and page content
- Impact: Reduces setup time and gives each row a useful starting page

## Links
- Announcement draft
- Changelog entry
- Support documentation
- Internal rollout notes

## Publishing checklist
- [x] Confirm feature scope
- [ ] Add final screenshots
- [ ] Review copy with product marketing
- [ ] Publish changelog
- [ ] Notify customer-facing teams`,
        emoji: "📣",
        title: "Publish release notes",
        values: { Date: "2026-07-08", Status: "Done" },
      },
    ],
  },
  {
    colorId: "blue",
    emoji: "🚀",
    id: "projects",
    name: "Projects",
    properties: [
      { config: getDefaultPropertyConfig("status"), name: "Status", type: "status" },
      { name: "Date", type: "date" },
      { name: "Person", type: "person" },
    ],
    sampleRows: [
      {
        content: `# Website refresh

## Project overview
Refresh the marketing website to improve clarity, conversion, and product storytelling while preserving the parts of the current site that already perform well.

## Success metrics
- Increase qualified signup conversion from product pages
- Reduce bounce rate on the homepage
- Improve page speed on mobile
- Make pricing and integrations easier to discover

## Milestones
- Discovery and analytics review
- Information architecture proposal
- Homepage and pricing page design
- Content migration and QA
- Launch and post-launch measurement

## Risks
- Copy approval may delay design handoff
- Legacy pages may contain undocumented redirects
- Performance can regress if media assets are not optimized

## Weekly update template
- What changed this week?
- What decisions are needed?
- What is blocked?
- What will ship next?

## Action items
- [ ] Audit top landing pages
- [ ] Confirm primary conversion events
- [ ] Review competitor positioning
- [ ] Draft launch checklist`,
        emoji: "🌐",
        title: "Website refresh",
        values: { Date: "2026-07-10", Status: "In progress" },
      },
      {
        content: `# Mobile onboarding

## Objective
Design and ship a clearer first-run mobile experience that helps new users understand the core workflow and create their first useful page.

## Target users
- New users arriving from web signup
- Existing users opening the mobile app for the first time
- Team members joining an invited page

## Activation events
- User signs in successfully
- User opens their first page
- User creates or edits a note
- User returns within seven days

## Proposed flow
- Welcome screen with page context
- Permission prompts only when needed
- First note or database creation shortcut
- Lightweight education through empty states

## Experiment ideas
- Compare checklist onboarding against a single guided action
- Test default page examples for personal and team use
- Measure whether template suggestions increase first-session completion

## Implementation checklist
- [ ] Define analytics events
- [ ] Review mobile copy
- [ ] Create empty state assets
- [ ] QA account invitation flow
- [ ] Schedule post-launch review`,
        emoji: "📱",
        title: "Mobile onboarding",
        values: { Date: "2026-07-17", Status: "Not started" },
      },
      {
        content: `# Customer feedback review

## Purpose
Synthesize recent feedback into themes, decisions, and follow-up work that can be prioritized by the product team.

## Inputs
- Support conversations from the last 30 days
- Sales call notes from active opportunities
- Product analytics around database creation
- User interviews and research notes

## Themes
- Users want templates to create useful starter data
- Row pages need enough content to demonstrate how nested pages behave
- Database setup should feel immediate and not require manual cleanup

## Decisions
- Seed rows only when the database is empty
- Keep sample content editable and realistic
- Use generic example links and names until workspace-specific generation exists

## Follow-up
- [x] Group feedback themes
- [x] Pick first improvement area
- [ ] Add deeper template content
- [ ] Re-test with a new page
- [ ] Capture screenshots for the changelog`,
        emoji: "💬",
        title: "Customer feedback review",
        values: { Date: "2026-07-24", Status: "Done" },
      },
    ],
  },
  {
    colorId: "yellow",
    emoji: "📚",
    id: "document-hub",
    name: "Document Hub",
    properties: [
      { config: getDefaultPropertyConfig("status"), name: "Status", type: "status" },
      { name: "Person", type: "person" },
      { name: "URL", type: "url" },
    ],
    sampleRows: [
      {
        content: `# Team handbook

## Purpose
Keep operating principles, team rituals, and onboarding references in one place so new and existing team members can find the source of truth quickly.

## Team principles
- Write decisions down where the work happens
- Prefer clear owners and dates over vague next steps
- Keep meeting notes connected to projects and tasks
- Make important context easy to discover asynchronously

## Recurring rituals
- Weekly planning on Mondays
- Midweek project review on Wednesdays
- Customer feedback review every other Friday
- Monthly retrospective and process cleanup

## Onboarding links
- Company overview
- Product walkthrough
- Engineering setup
- Support playbook
- Security and access checklist

## Maintenance checklist
- [ ] Assign handbook owner
- [ ] Review outdated links monthly
- [ ] Add missing team policies
- [ ] Link key databases from relevant sections`,
        emoji: "📘",
        title: "Team handbook",
        values: { Status: "Done", URL: "https://example.com/handbook" },
      },
      {
        content: `# Product requirements

## Problem
Users can create a database from a template, but the resulting row pages feel empty. This makes templates less useful because users still need to invent example content before they understand the workflow.

## Target users
- New users exploring database templates
- Teams building shared trackers
- Users migrating from lightweight docs to structured databases

## Requirements
- Templates create properties, rows, property values, and row page content
- Row page content should be detailed enough to demonstrate realistic usage
- Seeded content should not duplicate when setup is applied to a populated database
- Content should be editable immediately after creation

## Non-goals
- Generating workspace-specific content
- Importing external documents
- Adding a template marketplace in this iteration

## Acceptance criteria
- [ ] Selecting any template creates sample rows
- [ ] Opening a sample row shows structured page content
- [ ] Content includes headings, bullets, and checklists
- [ ] Existing populated databases are not reseeded`,
        emoji: "📋",
        title: "Product requirements",
        values: { Status: "In progress", URL: "https://example.com/prd" },
      },
      {
        content: `# Research notes

## Research question
What makes a database template feel useful immediately after creation?

## Observations
- Empty rows require users to imagine how the template should be used
- Properties alone are not enough to communicate a workflow
- Row pages are more discoverable when their titles and table values are concrete
- Detailed examples help users replace content rather than start from a blank page

## Interview notes
- "I want to see what a finished row looks like before I build my own."
- "Templates should teach the workflow, not just create columns."
- "The row page is where the real context belongs."

## Synthesis
- Good templates should include both database-level structure and page-level examples
- Sample content should use generic but believable operating scenarios
- Checklists are useful because they invite immediate editing

## Next steps
- [ ] Validate new sample content with a clean page
- [ ] Capture before and after screenshots
- [ ] Identify which templates need additional properties later`,
        emoji: "🔎",
        title: "Research notes",
        values: { Status: "Not started", URL: "https://example.com/research" },
      },
    ],
  },
]

export const databaseSetupMoreTemplates: DatabaseSetupTemplate[] = [
  {
    colorId: "purple",
    emoji: "🗓️",
    id: "content-calendar",
    name: "Content Calendar",
    properties: [
      { name: "Date", type: "date" },
      { config: getDefaultPropertyConfig("status"), name: "Status", type: "status" },
      { name: "Person", type: "person" },
    ],
    sampleRows: [
      {
        content: `# Launch announcement

## Campaign goal
Announce the release in a way that clearly explains the customer value, shows the workflow, and drives readers to try the feature.

## Message pillars
- Templates now create useful starter content, not only columns
- Every sample row includes an editable page
- Teams can understand the intended workflow faster

## Channels
- Product changelog
- Email newsletter
- In-app announcement
- Social posts
- Customer-facing team enablement

## Draft copy
Start with the problem: blank templates still leave setup work for the user. Then show the improvement: choosing a template creates a working example with rows, properties, and detailed page content.

## Assets needed
- Screenshot of the template picker
- Screenshot of the seeded table
- Screenshot of an opened row page
- Short demo clip

## Approval checklist
- [ ] Product review
- [ ] Design review
- [ ] Support review
- [ ] Final publish approval`,
        emoji: "📢",
        title: "Launch announcement",
        values: { Date: "2026-07-06", Status: "In progress" },
      },
      {
        content: `# Customer story

## Story angle
Show how a team moved from scattered project notes to a structured page where tasks, docs, and decisions stay connected.

## Customer profile
- Growing product team
- Multiple projects running in parallel
- Needs lightweight structure without heavy process

## Narrative
- Before: status updates lived in separate docs, project trackers, and chat threads
- Turning point: the team used database row pages to keep context attached to each project
- After: stakeholders could scan the table and open any row for the full story

## Proof points
- Faster weekly status preparation
- Fewer repeated questions in project reviews
- Clearer ownership across milestones

## Questions for interview
- What changed after the team adopted row pages?
- Which project workflows became easier to maintain?
- What advice would you give to a new team setting up templates?

## Production checklist
- [ ] Confirm customer participation
- [ ] Draft interview guide
- [ ] Collect quotes
- [ ] Send story for approval
- [ ] Prepare launch assets`,
        emoji: "🏆",
        title: "Customer story",
        values: { Date: "2026-07-13", Status: "Not started" },
      },
      {
        content: `# Monthly newsletter

## Theme
Help readers discover practical ways to organize work with database templates and connected row pages.

## Sections
- Product update: richer database templates
- Workflow tip: use row pages for decisions and notes
- Customer highlight: structured project reviews
- Resource link: getting started with database templates

## Draft intro
This month, we focused on making new pages useful faster. Database templates now create realistic starter rows and detailed row pages, so you can see how the workflow fits together before replacing the examples with your own work.

## Links to include
- Feature announcement
- Template guide
- Example page
- Feedback form

## Send checklist
- [ ] Finalize subject line
- [ ] Review preview text
- [ ] Verify every link
- [ ] Send internal test
- [ ] Schedule campaign`,
        emoji: "📰",
        title: "Monthly newsletter",
        values: { Date: "2026-07-20", Status: "Done" },
      },
    ],
  },
  {
    colorId: "orange",
    emoji: "📝",
    id: "meeting-notes",
    name: "Meeting Notes",
    properties: [
      { name: "Date", type: "date" },
      { name: "Person", type: "person" },
      { name: "Text", type: "text" },
    ],
    sampleRows: [
      {
        content: `# Weekly planning

## Agenda
- Review current priorities
- Confirm project owners and due dates
- Identify blocked work
- Decide what needs leadership attention
- Create follow-up tasks

## Updates
- Template setup improvements are in progress
- Database rows now need richer row page content
- Launch communication depends on screenshots from the final flow

## Decisions
- Seed sample content only when a database has no rows
- Use realistic but generic examples across templates
- Keep row page content structured as markdown-style sections

## Follow-ups
- [ ] Add detailed content to every template row
- [ ] Run web build and regression tests
- [ ] Test template creation in a fresh database
- [ ] Capture launch screenshots

> Keep the final decisions here so the project history stays attached to the planning row.`,
        emoji: "📅",
        title: "Weekly planning",
        values: { Date: "2026-07-02", Text: "Confirm priorities and owners." },
      },
      {
        content: `# Design review

## Review goal
Evaluate whether the database setup experience communicates the value of templates clearly and creates a useful first impression.

## What to inspect
- Template picker layout and labels
- Loading and disabled states during template creation
- Seeded rows in table view
- Row page content when a sample row is opened
- Empty database behavior

## Feedback
- Template rows should feel like real examples, not lorem ipsum
- Row page content should include headings and checklists
- Dates and statuses should make the table feel active
- The setup card should close only after seeding completes

## Open questions
- Should template-created content have a visible "sample" label?
- Should users be able to create a template without sample rows?
- Should future templates include icons or covers for row pages?

## Action items
- [x] Confirm seeded rows are desirable
- [ ] Review final row page formatting
- [ ] Check mobile table behavior
- [ ] Validate dark mode contrast`,
        emoji: "🎨",
        title: "Design review",
        values: { Date: "2026-07-09", Text: "Review open decisions." },
      },
      {
        content: `# Retrospective

## Context
The team shipped a template setup improvement that creates database structure, sample rows, property values, and detailed row page content.

## What worked
- Reusing existing mutations kept behavior aligned with normal edits
- Keeping template content in one file made future changes straightforward
- Build and test coverage caught type issues quickly

## What was difficult
- Row pages are created indirectly through database rows, so content seeding needed to update the page after row creation
- The template content needed enough detail to be useful without becoming too specific
- Markdown-like content needed conversion into editor JSON

## Changes for next time
- Add a focused test for template seeding when the API layer has a stable mock
- Consider a shared markdown conversion helper outside editor runtime
- Review seeded content with product and design before release

## Follow-up checklist
- [ ] Test with every template
- [ ] Confirm no duplicate seeding on populated databases
- [ ] Update release notes
- [ ] Add screenshots to documentation`,
        emoji: "🔁",
        title: "Retrospective",
        values: { Date: "2026-07-16", Text: "Capture wins and follow-ups." },
      },
    ],
  },
  {
    colorId: "red",
    emoji: "🤝",
    id: "crm",
    name: "CRM",
    properties: [
      { config: getDefaultPropertyConfig("status"), name: "Status", type: "status" },
      { name: "Person", type: "person" },
      { name: "Email", type: "email" },
    ],
    sampleRows: [
      {
        content: `# Acme Co.

## Account summary
Acme Co. is evaluating a shared page for project tracking, customer research, and executive status updates.

## Opportunity
- Use case: centralize product planning and customer feedback
- Team size: 45
- Current tools: docs, spreadsheets, and chat threads
- Decision timeline: end of quarter

## Key contacts
- Alex Morgan: product operations lead
- Priya Shah: VP of Product
- Jamie Lee: implementation owner

## Recent notes
- The team wants database templates that are ready to edit immediately
- Row pages are important because project context currently gets lost in separate documents
- Security review is expected after the workflow demo

## Risks
- Procurement may require extra time
- Data migration expectations need to be scoped carefully
- Executive sponsor has not attended a demo yet

## Next steps
- [ ] Send workflow demo recording
- [ ] Schedule security review
- [ ] Confirm implementation timeline
- [ ] Prepare migration plan`,
        emoji: "🏢",
        title: "Acme Co.",
        values: { Email: "alex@example.com", Status: "In progress" },
      },
      {
        content: `# Northstar Labs

## Discovery summary
Northstar Labs is exploring a lightweight system for research notes, experiment tracking, and leadership reporting.

## Qualification
- Pain: research findings are hard to connect to roadmap decisions
- Desired outcome: make project context easier to find and maintain
- Budget: not confirmed
- Timeline: early evaluation

## Stakeholders
- Sam Rivera: research lead
- Dana Kim: product manager
- Operations team: responsible for rollout process

## Questions to answer
- How many existing research notes need migration?
- Which templates would the team use first?
- Does leadership need read-only dashboards?
- Who owns page hygiene after rollout?

## Follow-up email outline
- Recap the research workflow discussed
- Share a sample database template
- Offer a working session to model their first tracker
- Ask about timeline and evaluation criteria

## Next steps
- [ ] Send recap email
- [ ] Confirm evaluation owner
- [ ] Share example page
- [ ] Schedule workflow mapping session`,
        emoji: "🧪",
        title: "Northstar Labs",
        values: { Email: "sam@example.com", Status: "Not started" },
      },
      {
        content: `# Bright Market

## Account status
Bright Market completed the initial rollout and is ready for a customer success handoff.

## Implementation notes
- Started with project and meeting notes templates
- Created shared databases for campaign planning and customer feedback
- Assigned page owners for each department
- Requested a follow-up session on advanced database views

## Success criteria
- Marketing team plans campaigns in a shared calendar
- Project owners update status before weekly review
- Leadership can open row pages for full context
- New team members can understand active work without asking for separate docs

## Expansion ideas
- CRM template for partnership tracking
- Document hub for campaign assets
- Quarterly planning page

## Handoff checklist
- [x] Confirm rollout completion
- [x] Share onboarding resources
- [ ] Schedule advanced views session
- [ ] Review adoption metrics after 30 days
- [ ] Identify expansion sponsor`,
        emoji: "🌟",
        title: "Bright Market",
        values: { Email: "jordan@example.com", Status: "Done" },
      },
    ],
  },
]

export function getDatabaseSetupTemplate(
  templateId: DatabaseSetupTemplateId,
): DatabaseSetupTemplate | null {
  return (
    [...databaseSetupSuggestedTemplates, ...databaseSetupMoreTemplates].find(
      (template) => template.id === templateId,
    ) ?? null
  )
}

export function inferDatabaseSetupTemplateId(
  prompt: string,
): DatabaseSetupTemplateId | null {
  const normalized = prompt.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (/(task|todo|tracker)/.test(normalized)) {
    return "tasks-tracker"
  }

  if (/(project|roadmap|sprint)/.test(normalized)) {
    return "projects"
  }

  if (/(document|doc|wiki|hub)/.test(normalized)) {
    return "document-hub"
  }

  if (/(calendar|content|publish)/.test(normalized)) {
    return "content-calendar"
  }

  if (/(meeting|notes|standup)/.test(normalized)) {
    return "meeting-notes"
  }

  if (/(crm|customer|lead|sales)/.test(normalized)) {
    return "crm"
  }

  return null
}
