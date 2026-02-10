const state = {};
const submitBtn = document.getElementById("submitBtn");
const emailEl = document.getElementById("email");

function updateButton() {
  submitBtn.disabled = !(
    state.platform &&
    state.role &&
    state.feedback &&
    emailEl.value.includes("@")
  );
}

document.querySelectorAll(".choice").forEach(btn => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(`[data-group="${btn.dataset.group}"]`)
      .forEach(b => b.classList.remove("selected"));

    btn.classList.add("selected");
    state[btn.dataset.group] = btn.textContent;
    updateButton();
  });
});

emailEl.addEventListener("input", updateButton);

document.getElementById("betaForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  submitBtn.disabled = true;

  const payload = {
    platform: state.platform,
    role: state.role,
    email: emailEl.value.trim(),
    wantsFeedback: state.feedback === "Yes"
  };

  const res = await fetch("/.netlify/functions/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    alert("Signup failed. Please try again.");
    submitBtn.disabled = false;
    return;
  }

  document.getElementById("formView").style.display = "none";
  document.getElementById("successView").style.display = "block";
});
