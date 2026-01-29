# COPE iOS Mobile App

## Overview

Native iOS app for COPE agent with push notifications, lock screen widgets, and Dynamic Island support.

## Why Native iOS?

| Feature | PWA | React Native | Native Swift |
|---------|-----|--------------|--------------|
| Push notifications | Limited | Yes | Yes |
| Lock screen widgets | No | No | Yes (WidgetKit) |
| Dynamic Island | No | No | Yes (Live Activities) |
| Interactive widgets | No | Limited | Yes (App Intents) |
| Background refresh | Limited | Yes | Yes |

Native Swift is required for the premium iOS features we want.

## Architecture

```
┌─────────────────────────────────────────┐
│              Fly.io                     │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │ COPE HTTP   │  │ APNs Push       │   │
│  │ Server      │  │ Service         │   │
│  └──────┬──────┘  └────────┬────────┘   │
└─────────┼──────────────────┼────────────┘
          │                  │
          ▼                  ▼
    ┌─────────────────────────────────┐
    │     iOS App (Swift)             │
    │  ┌────────┐ ┌────────────┐      │
    │  │ Main   │ │ Widget     │      │
    │  │ App    │ │ Extension  │      │
    │  └────────┘ └────────────┘      │
    │  ┌────────────────────────────┐ │
    │  │ Live Activities            │ │
    │  │ (Dynamic Island + Lock)    │ │
    │  └────────────────────────────┘ │
    └─────────────────────────────────┘
```

## Features

### Phase 1: Basic App + Dynamic Island Timers

**Main App:**
- Connect to COPE HTTP server (authenticated)
- Chat interface to send messages to agent
- View and manage active timers
- Create quick timers (1min, 5min, 15min, custom)

**Live Activities (Dynamic Island):**
- Show active timer countdown in compact view
- Expanded view shows label + time remaining
- Tap to open app
- Cancel button in expanded view
- Works on lock screen too

### Phase 2: Lock Screen Widgets

**Small Widget:**
- Next timer countdown
- Or "No active timers"

**Medium Widget:**
- List of active timers (up to 3)
- Tap to open app

**Large Widget:**
- Active timers
- Quick actions (start common timers)
- Today's upcoming calendar items

### Phase 3: Push Notifications

**Timer Alerts:**
- Push when timer expires (even if app closed)
- Rich notification with snooze/dismiss actions

**Proactive Notifications:**
- Daily briefing summary
- Upcoming calendar reminders
- Task due reminders

**Requires:**
- APNs setup in Apple Developer account
- Push service on Fly.io (new endpoint or separate service)
- Device token registration

### Phase 4: Interactive Widgets & Shortcuts

**App Intents:**
- "Set a 5 minute timer" via Siri
- "What's on my calendar?" via Siri
- Shortcuts app integration

**Interactive Widgets:**
- Start timer directly from widget
- Mark task complete from widget
- Quick capture to inbox

## Technical Requirements

### iOS App (Swift/SwiftUI)

```
cope-ios/
├── COPE/                    # Main app target
│   ├── COPEApp.swift
│   ├── Views/
│   │   ├── ChatView.swift
│   │   ├── TimersView.swift
│   │   └── SettingsView.swift
│   ├── Services/
│   │   ├── COPEClient.swift      # HTTP client
│   │   └── LiveActivityManager.swift
│   └── Models/
├── COPEWidgets/             # Widget extension
│   ├── TimerWidget.swift
│   └── TaskWidget.swift
├── COPEIntents/             # App Intents extension
│   └── TimerIntents.swift
└── Shared/                  # Shared code
    └── Models/
```

### Server-Side Changes (Fly.io)

1. **APNs Integration:**
   - Add endpoint to register device tokens
   - Add push notification service
   - Store device tokens in Sanity

2. **Timer Document Update:**
   ```typescript
   interface Timer {
     // ... existing fields
     deviceTokens?: string[];  // Devices to notify
     notified?: boolean;       // Already sent push?
   }
   ```

3. **Push Service:**
   - Watch for expired timers
   - Send APNs notifications
   - Could be separate Fly app or background worker

### Apple Developer Requirements

- Apple Developer Program membership ($99/year)
- App ID with capabilities:
  - Push Notifications
  - App Groups (for widget data sharing)
  - Siri & Shortcuts
- APNs key or certificate

## Implementation Order

1. **Basic Swift app** - Chat + timers, connects to COPE API
2. **Live Activities** - Dynamic Island timer countdown
3. **WidgetKit** - Lock screen timer widget
4. **APNs setup** - Server-side push capability
5. **Push notifications** - Timer expiry alerts
6. **App Intents** - Siri shortcuts
7. **Interactive widgets** - Quick actions

## Open Questions

- TestFlight for beta testing or just run locally?
- iCloud sync for settings/preferences?
- Apple Watch app? (WatchKit)
- iPad version with larger widgets?

## Resources

- [Live Activities](https://developer.apple.com/documentation/activitykit)
- [WidgetKit](https://developer.apple.com/documentation/widgetkit)
- [App Intents](https://developer.apple.com/documentation/appintents)
- [APNs](https://developer.apple.com/documentation/usernotifications)
