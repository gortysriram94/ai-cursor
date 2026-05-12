# Master/Slave Hybrid System

## Overview

Pushpa now has a **hybrid conversational + task execution** system:

1. **Conversational Mode** — Simple Q&A, greetings, clarifications
2. **Task Mode** — Complex work broken into Master + Slave nodes

---

## How It Works

### Decision Flow

```
User types message
    ↓
API classifies: CONVERSATION or TASK?
    ↓
CONVERSATION → Simple chat response
    ↓
TASK → Create Master Node with Slave Nodes
```

---

## Master/Slave Architecture

### Master Node
- **One per task**
- Contains: Task name, goal, list of slave nodes
- Tracks: Overall progress, free nodes remaining

### Slave Nodes
- **3-10 nodes per task**
- Each node: Atomic, independent step
- **First 3 additions are FREE**
- **After 3: $0.10 per node**

---

## Features

### 1. **Vertical/Horizontal Toggle**
- Vertical: Stacked list view
- Horizontal: Grid layout
- Toggle in nav when task is active

### 2. **Node Chat**
- Click any slave node to chat with it
- Master → Slave communication
- Each node has independent chat history

### 3. **Add Slave Nodes**
- Button: "+ ADD SLAVE NODE (X free)"
- Free: First 3 additions
- Paid: $0.10 after 3 free nodes
- Shows remaining free count

### 4. **Execution Flow**
1. User sends task message
2. Master node created with slaves
3. User can add/remove nodes
4. Click node to configure
5. Approve to execute
6. Each slave runs independently
7. Master aggregates results

---

## UI Layout

```
┌─────────────────────────────────────────────┐
│  Nav: [Logo] [Vertical/Horizontal] [Theme] │
├───────────────┬─────────────────────────────┤
│               │  MASTER NODE                │
│  CHAT         │  Task Name: "..."           │
│  COLUMN       │  Goal: "..."                │
│  (400px)      │  [+ ADD SLAVE NODE (2 free)]│
│               ├─────────────────────────────┤
│  Messages:    │  SLAVE NODES (grid/list)    │
│  - User       │  ┌─────────┐ ┌─────────┐   │
│  - Assistant  │  │ Slave 1 │ │ Slave 2 │   │
│  - Task       │  │ Status  │ │ Status  │   │
│               │  │ [Chat]  │ │ [Chat]  │   │
│  [Input]      │  └─────────┘ └─────────┘   │
└───────────────┴─────────────────────────────┘
```

---

## Example Scenarios

### Scenario 1: Conversational

**User:** "hello"  
**System:** CONVERSATION  
**Result:** Chat response, no task panel

### Scenario 2: Task Execution

**User:** "analyze my trading data"  
**System:** TASK  
**Result:**
- Chat panel stays (400px wide)
- Task panel appears (flex 1)
- Master node: "Trading Data Analysis"
- Slave nodes:
  1. Upload Data (free)
  2. Clean Data (free)
  3. Analyze Patterns (free)
  4. Generate Report (free)

### Scenario 3: Adding Nodes

**User clicks:** "+ ADD SLAVE NODE"  
**First 3:** FREE  
**After 3:** Show alert → "$0.10 per additional node"  
**On confirm:** Stripe payment → Add node

---

## Pricing Model

### Free Tier
- Unlimited conversation
- Task execution: First 3 slave node additions FREE
- Base task creation: FREE

### Paid
- **Additional nodes:** $0.10 each (after 3 free)
- **Task execution:** Included in base pricing
- **Master node:** FREE (one per task)

---

## Technical Implementation

### Frontend (`/chat`)
- React state: `currentTask` (MasterNode | null)
- View toggle: `viewMode` ("vertical" | "horizontal")
- Node selection: `selectedNode` (string | null)
- Chat history per node

### Backend (`/api/chat-or-task`)
1. **Classifier:** Decides conversation vs task
2. **Conversation:** Direct Claude API call
3. **Task:** Create master/slave structure

### Data Flow
```
User Input
  ↓
POST /api/chat-or-task
  ↓
Classify (conversation | task)
  ↓
If conversation:
  → Claude API → Response
  
If task:
  → Task Planner → Master + Slaves
  → Frontend renders nodes
  → User configures
  → Execute
```

---

## Node Communication

Each slave node has **independent chat**:

```
Master → Slave: "Use this data: [summary]"
Slave → Master: "Processing..."
Master → Slave: "Adjust analysis for Q4"
Slave → Master: "Updated analysis ready"
```

---

## Cost Tracking

- **Conversation:** Standard $0.10/message
- **Task creation:** Included in first message
- **Slave additions:** 
  - 0-3: FREE
  - 4+: $0.10 each
- **Node execution:** Standard API pricing

---

## Future Enhancements

1. **Node dependencies** — Slave 2 waits for Slave 1
2. **Parallel execution** — Run multiple slaves at once
3. **Node templates** — Pre-built node configs
4. **Export plan** — Save task structure
5. **Share tasks** — Collaborate with team

---

## Key Benefits

✅ **Conversational + Task execution** in one interface  
✅ **Visual progress** — See each step  
✅ **Full control** — Configure each node  
✅ **Transparent costs** — Know before you pay  
✅ **Flexible layout** — Vertical or horizontal  
✅ **Expandable** — Add nodes as needed  

---

## This Solves

❌ **Old problem:** Everything forced into breadcrumbs  
✅ **New solution:** Chat for simple, tasks for complex  

❌ **Old problem:** No way to modify execution  
✅ **New solution:** Chat with each slave node  

❌ **Old problem:** Fixed workflow  
✅ **New solution:** Add/remove nodes dynamically  
