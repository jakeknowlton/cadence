# Cadence

Product specification. v0.5, built through the first local-testable release. How it is built is in [DESIGN.md](DESIGN.md). Decisions and their dates are in the appendix.

## Overview

Cadence is a small, invite-only web app for a group of people who hold each other to a rhythm of recurring tasks. An admin creates a group, defines the tasks its members are expected to do daily, weekly, or monthly, and adds members. Members check tasks off, optionally logging details such as miles run or calories eaten. Everyone in the group sees everyone's progress. History is kept forever and stays comparable even when the group changes its tasks, and members can see their progress over time in charts. Members can choose to be notified when others in the group complete a task.

The app lives at `cadence.jkn.dev`. The package and Firebase project are named `cadence`.

### Goals

- Invite-only. There is no public signup.
- Two roles: user and admin. An admin is a user with extra privileges.
- Admins manage users, groups, membership, and task definitions.
- Logging a completion takes one tap for simple tasks and a few seconds for tasks with fields.
- Tasks are flexible: cadence, active days, a simple checkbox or structured fields, an optional target, and a required count per period.
- Nothing is lost by accident. Changing a task never alters past data, and long-term stats remain meaningful across changes. Only an admin's explicit, confirmed delete removes data.
- Members control their own notification preferences per group.
- Mobile-first and installable as a web app on a phone.
- Minimal operations and zero hosting cost. The app runs on Firebase's free plan with no server-side code at all.

### Non-goals for v1

- Social features beyond the group, or leaderboards across groups.
- Native mobile apps.
- Fitness tracker integrations.
- Hiding a member's logged values from the rest of their group. Everyone in a group sees everyone's data.
- Excusing a member from a period. Missed means missed.
- Email, for invites or notifications.
- Push notifications. Sending a push needs a server; see Notifications for what the free-plan app does instead.

## Concepts

| Term | Meaning |
|------|---------|
| **User** | A person with an account. Has a role (user or admin), a display name, and a timezone. |
| **Invite** | Created by an admin for one email address, optionally naming groups to join. Accepting an invite is the only way to get an account. |
| **Group** | A named set of members and tasks, such as "Fall Shred Crew". |
| **Membership** | A user's relationship to one group: when they joined, when they left, and their notification preferences for that group. |
| **Task** | A recurring expectation defined by the group. A task keeps a stable identity across edits. |
| **Task version** | The definition of a task during a date range. Editing a task in a way that affects how it is judged creates a new version; earlier versions remain for history. |
| **Cadence** | How often a task recurs: daily, weekly, or monthly. |
| **Period** | One specific day, week, or month that a task is measured in. |
| **Completion** | A record that a member did a task in a period, with any logged values. Completions are facts and are never changed by later task edits. |
| **Counting completion** | A completion that satisfies the task: every required field has a value, and every number or duration entered is within its field's min and max. |
| **Cadence segment** | A run of consecutive task versions sharing the same cadence. Completion rate and streaks are reported per segment. |
| **Edit window** | The number of recent days a member may still log or correct completions for. A group setting. |

## Roles and permissions

| Capability | User | Admin |
|-----------|:----:|:-----:|
| Sign in after accepting an invite | ✓ | ✓ |
| View groups they belong to: members, tasks, completions, stats | ✓ | ✓ |
| Log, edit, and delete their own completions within the edit window | ✓ | ✓ |
| View their own past completions from groups they have left | ✓ | ✓ |
| Edit their own profile, timezone, and notification preferences | ✓ | ✓ |
| Invite users; revoke invites | | ✓ |
| Deactivate and reactivate users; grant and remove the admin role | | ✓ |
| Create, archive, restore, and delete groups; add and remove members | | ✓ |
| Create, edit, archive, restore, and delete tasks | | ✓ |
| Correct any member's completion at any time | | ✓ |
| View every group, including ones they are not in | | ✓ |

Admins are global, not per group. The last remaining admin cannot remove their own admin role.

## Accounts and invites

An admin creates an invite for an email address. The app shows a link, which the admin copies and sends however they like. Group membership is added by the admin after the person has joined. Invites are single-use and expire after 14 days. Admins can revoke an invite or copy its link again.

Opening the link lets the invitee sign in with Google, or create an account with their email address and a password. Google accounts are already verified. An email account gets a verification email and must open its link before the invite can be accepted; the invite page waits on that step and can resend the email. Password reset is available from the sign-in screen. The signed-in account's email must match the invite and be verified. If it does not match, the invitee sees which address the invite was for and can sign out to try another. On success the account is created and the invite is marked used, in one atomic write that the access rules validate.

Anyone who signs in without an accepted invite sees a "you need an invite" screen and can access nothing else. This is enforced by access rules, not only by the interface.

An admin can deactivate a user. A deactivated user can no longer read or write anything, but their history remains visible to their groups. The first admin is created by hand when the project is set up.

## Groups

An admin creates a group with a name, description, icon, colour, week start day (Sunday or Monday), and edit window in days (default 2). Groups can be archived or deleted; see **Archiving and deleting**.

The week start day locks once the group has any weekly completion. Changing it afterwards would create a week that overlaps the previous one, so a group that needs a different week start is a new group.

Admins add and remove members. Removing a member keeps all their completions. The member can still see their own completions from that group, but not the group's pages. The admin can add them back. Users can belong to several groups and switch between them. Only admins change membership; users cannot leave on their own.

## Tasks

### Definition

A task version has the following properties.

| Property | Meaning |
|----------|---------|
| Name, description, icon, sort order | How the task is shown. Icons come from Phosphor Icons. |
| Cadence | Daily, weekly, or monthly. |
| Active days | For daily tasks only: which weekdays the task applies to. Default every day. |
| Required count | How many counting completions make a period complete. Default 1. "Lift three times a week" is a weekly task with a required count of 3. |
| Completion type | Checkbox, or fields. |
| Fields | For field tasks: a list of inputs. See **Fields** below. |

### Fields

Each field has a key, a label, and a type: number, duration, text, yes/no, or choice. Number fields may have a unit, and choice fields a list of choices. Every other setting is optional and chosen by the admin; the app never infers one setting from another.

| Setting | Applies to | Meaning |
|---------|-----------|---------|
| **Required** | All types | A completion only counts if this field has a value. |
| **Default** | All types | The value the field starts with. With no default the field starts empty, including yes/no fields. |
| **Min** and **max** | Number, duration | A value entered outside them is saved but the completion does not count. Either may be left empty; set both to the same number for "exactly". Nothing is ever refused. |
| **Round to** | Number | Each entry is rounded to the nearest multiple when saved, so 0.1 keeps one decimal place and 5 rounds to the nearest 5. |

A default must be within its field's min and max and, for numbers, a multiple of its rounding, so logging the defaults always counts. Durations, including their min, max, and default, are entered as minutes and seconds or hours, minutes, and seconds.

### Examples

A weekdays-only checkbox, "Walk at lunch": daily, active Monday to Friday, checkbox, required count 1.

Visibility only, "Track calories": daily, required number field `kcal` with no min or max and no default. Logging always opens the sheet, and any number completes the day.

A ceiling, optional number, "Stay under 2200": daily, optional number field `kcal` with max 2200. Tapping the check completes the day with no number. Entering 1,850 also completes it; 2,400 is recorded but does not.

An amount, "Run a mile": daily, required number field `miles` with min 1 and default 1, and optional duration field `time`. Tapping the check logs 1 mile and completes the day. Opening the sheet lets the member enter 1.5 miles, which also completes it, or 0.5 miles, which is recorded but does not.

Two limits, "Run a mile under 10 minutes": required `miles` with min 1 and default 1, required `time` with max 10:00 and no default. `time` has no default, so logging opens the sheet.

### When a period is done

A period is complete for a member when the number of counting completions in it reaches the required count. A period is **inactive** for a member when the task's active days exclude it, the task version was not in effect, or the member was not yet in the group. Inactive periods are neither complete nor missed and are excluded from rates and streaks.

A completion **counts** when every required field has a value and every number or duration entered is within its field's min and max. A blank optional field never stops a completion counting. Whether a completion counts is never stored; it is worked out from the completion and the task version it was logged against.

### Editing tasks

Every completion keeps a snapshot of the task version it was logged against, so history always renders with the definition that applied at the time. Edits to a task fall into three classes.

| Class | Changes | Effect |
|-------|---------|--------|
| **Cosmetic** | Name, description, icon, sort order, field labels, field defaults, charts | Applied in place. History shows the new name. Defaults and charts never change how a period is judged; changed charts redraw all history. |
| **Measured** | Cadence, active days, required count, completion type, adding or removing a field, a field's required flag, min, max, rounding, or choices | A new task version takes effect at the start of the next period. Past periods keep the old definition. |
| **Refused** | Changing an existing field's type or unit, or reusing a removed field's key with a different type or unit | Not allowed. The editor offers **Replace task** instead. |

The editor classifies the edit as the admin types and shows exactly what will happen, including the date a new version takes effect. New tasks start in the current period.

A completion has the same shape whatever the cadence or required count, so logged values can be totalled and charted straight across a measured change. What a measured change alters is how each period is judged, so completion rate and streaks are reported per cadence segment. A field's type or unit is the one thing that makes old and new values incomparable, so it is locked.

Replacing a task ends it at the start of the next period and creates a new one pre-filled from it, with a visible link between the two. The old task stays in history and stats. Stats never combine a task with the one it replaced.

### Archiving and deleting

Admins can archive or delete any task or group, from the bottom of the task's page or the group's Settings tab.

| Action | Effect | Undo |
|--------|--------|------|
| **Archive** | Takes effect immediately. The task or group disappears from every member view: Today, the Groups list, the group page, history, stats, personal history, and the inbox. Nothing is removed; admins see it under **Archived** in the admin area, with a banner saying members can't see it. Archiving a group hides all of its tasks. | Restore, from the same place. Everything returns as it was. |
| **Delete** | Permanently removes the task or group and everything that belongs to it: task versions, every completion logged against it, the group's member list, and the inbox items about it. A deleted task is also dropped from members' alert preferences. | None. |

Archiving asks for confirmation. Deleting opens a dialog that says how many completions from how many members will be removed, and the delete button stays disabled until the admin types the task or group name.

## Periods and time

A period is identified by its cadence and its first day: a day such as 15 October 2026, the week starting 12 October 2026, or the month starting 1 October 2026. Periods are worked out in the member's own timezone, which is stored on their profile and defaults from the browser. Because each completion records the period it was logged against rather than an instant, members in different timezones line up on the same day in group views.

The period a completion is logged against is the record. The time of day is kept for display only. A member who crosses timezones and skips a day simply logs yesterday.

Members may log, edit, or delete their own completions for any period that ended within the group's edit window, and for the current period. Admins may correct any completion at any time.

## Logging completions

The Today view is the home screen. It lists every active task across the member's groups, grouped by cadence, with the current period's status: not done, done, two of three, or logged but not counting. Daily tasks do not appear on inactive days.

A checkbox task completes with one tap and can be undone with another. A field task does the same when every required field has a default, logging every field's default. Any other field task opens a sheet with its fields, and tapping the task's name always opens it. The sheet marks required fields, which must be filled before saving, and says which entries are outside their min or max and that the completion will not count. Tasks with a required count above one show progress as completions accumulate. Any completion can carry a free-text note. Deleting a completion hides it; the record is kept.

## History, stats, and charts

Each group has an activity feed of who completed what, newest first, and a period grid of members against tasks for any chosen day, week, or month, showing done, missed, and logged but not counting, along with logged values. Past periods always use the task version that applied then.

### Stats

Stats are per member per task over a date range the viewer chooses, defaulting to the last 90 days.

| Stat | Definition |
|------|-----------|
| Completion rate | Complete periods divided by complete plus missed periods. Inactive periods are excluded. Per cadence segment. |
| Current streak | Consecutive active periods, ending at the current or most recent period, that are complete. Inactive periods are skipped, not broken. Per cadence segment. |
| Longest streak | The longest such run in the range. Per cadence segment. |
| Task charts | Each of the task's charts, over the range; see **Task charts**. |
| Group completion rate | The mean of members' completion rates. |

### Charts

Charts are the primary way members see progress over time. Each chart shows one member or all members overlaid, bucketed by week or by month regardless of the task's cadence, with a marker wherever the task version changed.

- The task's own charts, below.
- Completions over time: counting completions per bucket.
- Completion rate over time: per month, per cadence segment.

#### Task charts

An admin defines each task's charts in the task editor, and every member sees the same ones. The app never guesses what a field means; a chart says what to plot.

| Setting | Options |
|---------|---------|
| Name | Free text, such as "Pace". |
| Value | One number or duration field, or two of them divided (÷) or multiplied (×). |
| Combine by | Total, Average, Min, or Max, per bucket and over the date range. A divided value cannot be totalled. |

How values read follows from the field types: a duration divided by a number is time per unit ("9:12 /mi"), a number divided by a duration is per hour ("6.5 mi/h"), and anything else is a plain number or duration. The average of a divided value is total over total, so a five-mile run weighs more than a quarter mile; min and max use each entry's own value. Entries missing a field a chart needs are left out of that chart, and every logged entry is included whether it counted or not. Each member's stats card shows every chart's value over the date range with the number of entries it covers.

A task with no charts set shows a Total chart for each number and duration field. Charts are display only: they are never stored on completions and never affect whether a completion counts.

Stats and charts are computed in the app from the completions of one task at a time, which at a group's scale is a few thousand records at most.

## Notifications

For each group, a member chooses whether to be notified when another member completes a task, and can limit that to certain cadences or certain tasks.

Every notification appears in the in-app inbox, and the Inbox tab and the installed app's icon show an unread count. A member is never notified of their own completions. Undoing a completion sends nothing, and redoing it does not send a second notification: at most one notification per member, task, and period. Editing a completion sends nothing. Only a completion that counts sends a notification, so logging 2,400 kcal against a 2,200 max tells nobody.

Notifications are written by the completing member's app directly into each recipient's inbox, under access rules that only allow this between members of the same group. There is no server, so nothing arrives while the app is closed; the inbox fills in when the member next opens the app. Push notifications would need a server to send them and are a possible later addition on a paid plan.

## Platform requirements

- **Mobile-first.** Designed and built for a phone screen first; wider layouts are an enhancement. Navigation is a bottom tab bar (Today, Groups, Inbox, Me, and Admin for admins) that becomes a sidebar on wide screens. Tap targets are at least 44px, field entry uses a bottom sheet with a sticky primary button, and number fields bring up the numeric keyboard.
- **Installable.** The app is a progressive web app: installable to the Home Screen, with icons, safe-area handling for notched phones, and an unread badge on the icon where the platform supports it.
- **Works offline.** The Today view loads instantly from cache, and a check-off made offline syncs when the connection returns.
- **Dense views adapt.** The period grid shows one task or one member at a time on a phone and the full matrix on a wide screen. Charts are one per screen on a phone.
- **Accessible.** Keyboard and screen-reader usable; no hover-only controls.

## Delivery plan

Each phase ends with something usable.

| Phase | Scope | Done when |
|-------|-------|-----------|
| 0 Foundation | Firebase project and domain, local emulators, UI kit, app shell with bottom tabs, installable manifest, CI, period and task-edit logic with tests | The app runs locally against emulators and CI is green |
| 1 Identity | Sign-in, invites, profiles, admin user management, last-admin protection | An admin invites someone who then signs in; uninvited users see nothing |
| 2 Groups and tasks | Groups, membership, task editor with every field type and edit classification, versioning, replace task | Every task example works end to end; changing miles to kilometres is refused |
| 3 Logging | Today view, check-off, field sheet, required counts, field min and max, edit window, offline | Members log daily and see the group grid |
| 4 History, stats, charts | Period grid for past periods, activity feed, monthly rollups, stats, charts with version markers | Changing a task's cadence leaves last month's grid untouched and the miles chart continuous |
| 5 Notifications | Preferences, inbox written by the completing member's app, unread badge | A member sees exactly one inbox item when another checks off a task, even after an undo and redo |
| 6 Polish | Wide-screen layout, empty states, accessibility pass | The group uses it for a week without hitting a blocker |

v2 ideas: push notifications and reminders (both need a server, so a paid plan), streak badges, CSV export, task templates, pre-assigning groups on an invite.

## Appendix: decisions

All decided 15 October 2026 unless noted.

| # | Decision |
|---|----------|
| 1 | Admins are global only; no per-group admin role. |
| 2 | There is no separate goal setting. A field's min and max decide whether a completion counts, and out-of-range entries are kept but do not count. Required, default, min, max, and rounding are independent settings on each field, and the app never infers one from another. A task completes in one tap when every required field has a default. (Revised 18 October 2026.) |
| 3 | Week start day is configurable per group. |
| 4 | Invites are delivered by the admin copying a link. No email, for invites or notifications. |
| 5 | UI library is shadcn-vue on Tailwind CSS. |
| 6 | The app is named Cadence. |
| 7 | Hosted at cadence.jkn.dev. |
| 8 | Mobile-first; desktop is an enhancement. |
| 9 | Icons are Phosphor Icons. |
| 10 | Task edits are cosmetic, measured, or refused. Cadence changes are allowed; cadence-sensitive stats are reported per cadence segment. Only a field's type or unit is locked. |
| 11 | No private fields and no excused periods. |
| 12 | Week start locks once a group has any weekly completion. |
| 13 | Periods are identified by cadence and first day; task effective ranges are plain dates. |
| 14 | The edit window is measured in days, per group, default 2. |
| 15 | Firebase alone; no separate backend. (Superseded in part by 22: no server-side code at all.) |
| 16 | Charts and weekday-only daily tasks are v1 requirements. |
| 17 | The in-app inbox is the notification channel. (Push deferred by 22.) |
| 18 | Period boundaries use the member's timezone, and the logged period is the record. |
| 19 | Notifications fire once per member, task, and period, on creation only. |
| 20 | Only admins change membership. Removed members keep access to their own completions. |
| 21 | Access rules enforce identity, membership, and shape; the app enforces per-field validation and the exact edit window. |
| 22 | Spark plan only, no Cloud Functions. Invite acceptance is a rules-validated client batch; the inbox is written by the completing member's app; stats are computed in the app from raw completions. Push notifications deferred. |
| 23 | Invites no longer pre-assign groups; the admin adds members after they join. |
| 24 | Sign-in is Google, or email and password with a required verification email. Email link sign-in was dropped because the Spark plan allows only 5 such emails a day; verification emails allow 1,000. |
| 25 | Tasks and groups are archived, not retired. Archiving hides them from members immediately and only admins see their history; restoring brings them back. Admins can also hard-delete a task or group, with all its data, after typing its name. (18 October 2026.) |
