/* ═══════════════════════════════════════════════════════════════════
   FLOW — the step machine. One linear sequence:
     anonId → pre-survey → [baseline rounds] → [AI block 1]
       → mid-survey → [AI block 2] → post-survey → debrief

   Every non-task step is optional — Config.STEPS switches each on or off, and
   build() simply leaves the disabled ones out. The task rounds are never
   optional. Both AI blocks run for every participant; which mechanic is in
   which block is the group's counterbalance (Config.GROUPS).

   Surveys are ordinary steps. A task advances the flow itself: Task.confirm
   calls Flow.next() when the participant confirms a ranking.
   ═══════════════════════════════════════════════════════════════════ */
window.Flow = (function () {
  let steps = [];
  let i = 0;

  // Build the sequence from the (already-created/restored) session plan.
  function build() {
    const plan = Store.get().plan || [];
    /* G5/G6 run only the opening questionnaire (plus their own two). Rebuilt
       after the ID step re-pins the group (js/anon-id.js). */
    const g = Config.GROUPS[Store.group()];
    const only = g && g.surveys === "pre";   // G5/G6: opening survey only
    const surveys = Config.surveysFor(Store.group()) && !only;
    const S = Object.assign({}, Config.STEPS,
      only ? { midSurvey: false, postSurvey: false }
           : surveys ? {} : { preSurvey: false, midSurvey: false, postSurvey: false });
    steps = [];

    if (S.anonId) steps.push({ type: "anonId" });
    if (S.preSurvey) steps.push({ type: "survey", id: "pre" });

    const roundSet = Config.roundsFor(Store.group());   // G5 / G6, else null
    plan.forEach((p, idx) => {
      /* The mid-survey sits on the seam between the two AI blocks — it asks
         about the mechanic just finished, so it has to land before the next
         one introduces itself. Detected from the plan rather than counted, so
         it stays correct whatever the block lengths are. */
      const prev = plan[idx - 1];
      if (S.midSurvey && p.stage === "ai" && p.block === 2 && prev && prev.block === 1) {
        steps.push({ type: "survey", id: "mid" });
      }
      /* G5/G6: after round 7, questions about the AI they watched, then a
         pause screen that introduces rounds 8–9 (the AI reviewing them). */
      if (roundSet && p.mechanic === "hiddenEnd" && prev && prev.mechanic === "observe") {
        steps.push({ type: "survey", id: "observed" });
        steps.push({ type: "break" });
      }
      /* The step carries the round's own mechanic. planIndex indexes the PLAN,
         not this array, so inserting surveys never disturbs the task counter
         or Task.isNewSection. */
      steps.push({
        type: "task", stage: p.stage, taskId: p.taskId,
        mechanic: p.mechanic || null,   // which interaction THIS round runs
        block: p.block || 0,            // 1 or 2 for AI rounds; 0 for the baseline
        taskBlock: p.taskBlock || null, // which content set it came from
        deadline: p.deadline || null,   // G5: which deadline wording the tiles show
        character: p.character || null, // G5: a round that fixes its own AI
        resort: p.resort || 0,           // G5: the case the cursor puts down wrong first
        planIndex: idx,
      });
    });

    if (S.postSurvey) steps.push({ type: "survey", id: "post" });
    if (roundSet) steps.push({ type: "survey", id: "reviewed" });   // after round 9
    steps.push({ type: "debrief" });
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => { s.hidden = (s.id !== id); });
  }

  function render() {
    const step = steps[i];
    if (!step) return;
    Store.setStep(i);
    switch (step.type) {
      case "anonId":   AnonId.render(); break;
      case "survey":   Survey.render(step.id); break;
      case "task":     Task.start(step); break;
      case "break":    showBreak(); break;
      case "debrief":  Results.showDebrief(); break;
    }
  }

  /* G5/G6's pause before rounds 8–9: a plain screen and one button. */
  function showBreak(opts) {
    const $ = id => document.getElementById(id);
    $("break-kicker").textContent = I18n.t("ui.break.kicker");
    $("break-title").textContent = I18n.t("ui.break.title");
    $("break-text").textContent = I18n.t("ui.break.text");
    $("btn-break-next").textContent = I18n.t("ui.break.continue");
    showScreen("screen-break");
    if (!(opts && opts.silent)) Store.log("break_view", {});
  }

  // Enter the flow once the session exists.
  function begin() { go(0); }

  function go(n) { i = n; render(); }
  function next() { go(i + 1); }
  function current() { return steps[i] || null; }

  return { build, render, go, next, begin, current, showScreen, showBreak };
})();
