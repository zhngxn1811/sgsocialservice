const jobPostForm = document.querySelector("#jobPostForm");
const jobPostStatus = document.querySelector("#jobPostStatus");
const jobPostButton = jobPostForm.querySelector("button");

jobPostForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (jobPostButton.disabled) return;
  jobPostButton.disabled = true;
  jobPostStatus.dataset.state = "sending";
  jobPostStatus.textContent = "Submitting your listing…";
  try {
    const response = await fetch(jobPostForm.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(jobPostForm))),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || (response.status === 429
        ? "Too many submissions. Wait a minute and try again."
        : "Couldn’t submit your listing. Try again in a moment."));
    }
    jobPostForm.reset();
    jobPostStatus.dataset.state = "success";
    jobPostStatus.textContent = "Listing submitted. It won’t appear on the Jobs Board until it’s approved.";
  } catch (error) {
    jobPostStatus.dataset.state = "error";
    jobPostStatus.textContent = error instanceof TypeError
      ? "Couldn’t connect. Check your connection and try again."
      : error.message;
  } finally {
    jobPostButton.disabled = false;
  }
});
