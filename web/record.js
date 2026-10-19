const button = document.querySelector("#record"),
  status = document.querySelector("#status");
button.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser", frameRate: 20 },
        audio: false,
        selfBrowserSurface: "exclude",
      }),
      chunks = [],
      recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8",
        videoBitsPerSecond: 1600000,
      });
    button.disabled = true;
    let seconds = 0;
    status.textContent = "Recording started. Continue in the Daymark demo tab.";
    const timer = setInterval(() => {
      seconds++;
      status.textContent = "Recording… " + seconds + " / 90 seconds";
    }, 1000);
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      status.textContent = "Saving the continuous recording…";
      const response = await fetch("/recording", {
          method: "POST",
          headers: { "Content-Type": "video/webm", "X-Daymark-Recording": "1" },
          body: new Blob(chunks, { type: "video/webm" }),
        }),
        result = await response.json();
      status.textContent = result.saved
        ? "Saved " + result.name + " (" + result.bytes + " bytes)."
        : "The recording could not be saved.";
    };
    recorder.start(1000);
    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, 90000);
  } catch (e) {
    status.textContent = "Recording could not start: " + e.message;
  }
});
