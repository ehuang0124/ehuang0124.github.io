# Generic Skill for Building Quiz (Markdown)

## Overview
This document defines the structure, writing rules, and implementation patterns for creating Quiz pages on the site. All quiz content should follow the site copy axis (journey, roads, seasons, cities, history, people, feeling) and strictly avoid appliance manual copy.

## Structure & Writing Rules

### 1. Page Metadata & Title
- **One clear title per page:** The quiz title must stand alone (e.g., 「日本茶尋找器」, 「京都季節測驗」).
- **No promotional guide text above the title:** Do not add redundant metadata like 「7 題 · 2 分鐘 · 不需要註冊」 or 「JAPANESE TEA FINDER」. Let the title and action speak for themselves.
- **Navigation labels & action buttons:** Keep necessary navigation and accessible labels (e.g., 「開始測驗」, 「下一題」, 「結果」).

### 2. Copy Axis (Story vs Appliance)
- **Keep the story:** Narrative copy about places, seasons, weather, history, legends, food, light. (e.g., 「京都的春雨如何影響茶葉的香氣？」, 「這款茶源自於江戶時代的哪條街道？」).
- **Delete appliance copy:**
  - No storage/sync/cloud explainers (e.g., 「資料會同步到帳號」).
  - No manual-style instruction sentences (e.g., 「點一個選項，會跳轉到下一題」, 「請選擇一個答案」). The interface should make this obvious without prose.
  - No decorative slogans (e.g., 「COLLECT MOMENTS, NOT JUST PLACES」).
  - No duplicate attribution lines.
  - No pointers at the repo, Notion, or agent rules.

### 3. Interaction Logic (Auto-transition)
- **Immediate transition:** When an option is selected, the quiz should transition directly to the next question without requiring a separate "Next" button press.
- **Implementation:** The event listener for option selection must trigger the state change and UI update immediately (e.g., `option.addEventListener('click', () => { nextQuestion(); })`).
- **No manual instruction:** Do not write text saying 「按下選項後會自動跳轉」. The behavior is inherent to the UI.

### 4. Status & Feedback
- **Live status in shortest form:** Show only necessary feedback (e.g., 「正確」, 「錯誤」, 「得分：X/Y」) without explanation.
- **Accessibility & safety text:** Include `aria-label`, skip links, and keyboard instructions for dialogs if applicable.

### 5. Attribution & Honesty
- **Licence, photo, and font credits:** Shortest form in footer if applicable.
- **Data-honesty disclaimers:** Approximate-boundary notes (e.g., 「地點座標為概略位置」) if the quiz references specific geography.

## Implementation Pattern (Generic)

### Data Structure (`data.js` or inline)
```javascript
const quizData = [
  {
    id: "q1",
    question: "這款茶葉的產地位於哪條古道？", // Story axis
    options: [
      { id: "o1", text: "中山道", correct: false },
      { id: "o2", text: "東海道", correct: true },
      { id: "o3", text: "甲州道", correct: false }
    ],
    story: "江戶時代的旅人常在東海道的茶屋停留，品嚐這款帶有山霧氣息的茶。" // Narrative copy
  },
  // ...
];
```

### UI Logic (`quiz.js` / `app.js`)
- **State management:** Track current question index, score, and completed status.
- **Option selection handler:**
  ```javascript
  function handleOptionSelect(optionId) {
    const currentQuestion = quizData[currentIndex];
    const selectedOption = currentQuestion.options.find(o => o.id === optionId);
    
    // 1. Record answer & update score
    if (selectedOption.correct) score++;
    
    // 2. Immediate transition (no "Next" button press needed)
    currentIndex++;
    if (currentIndex < quizData.length) {
      renderQuestion(currentIndex); // Direct jump to next question
    } else {
      renderResult(); // Show final result
    }
  }
  ```
- **Rendering:**
  - Render question title and story copy.
  - Render options as clickable elements (buttons or list items).
  - **No instruction text** like 「請選擇一個答案」.
  - **No manual next button**; clicking an option triggers `handleOptionSelect`.

### CSS (`tea.css` or generic)
- Ensure options are clearly interactive (hover states, focus states).
- Ensure transition animations are smooth (fade or slide) for immediate jump.
- Maintain site copy axis: no appliance labels in CSS selectors (e.g., `.instruction-text` is forbidden; use `.story-copy` or `.question-title`).

## Working Rules
- **Cutting copy means cutting its CSS, JS hooks, affected tests, and doc references.**
- **New pages:** Write the story first. If a sentence cannot be traced to a place, season, person, or necessary status, it does not ship.
- **`agent.md` owns engineering rules; `skill.md` owns the copy axis.** When the axis moves, both move in the same PR.

## Example Quiz Structure (Markdown Template)

```markdown
# [Quiz Title]

## [Question 1 Title]
[Story copy about the place, season, or history related to the question]

- [Option A]
- [Option B]
- [Option C]

## [Question 2 Title]
[Story copy...]

- [Option A]
- [Option B]

## 結果
[Final narrative feedback based on the journey/score]
```

## Notes on Auto-Transition
- **User Experience:** Pressing an option immediately advances the quiz. No "Next" button is rendered or required.
- **Accessibility:** Ensure screen readers announce the transition or the new question state immediately.
- **Code Reference:** See `personal/tea-quiz/quiz.js` for an implementation example where `handleOptionSelect` triggers `nextQuestion()` directly.
