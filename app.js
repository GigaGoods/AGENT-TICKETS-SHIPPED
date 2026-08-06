const state = {
  account: "seller",
  documentSelected: false,
  verified: false,
  published: false,
  funded: false,
};

const $ = (id) => document.getElementById(id);
const accountButton = $("accountButton");
const accountMenu = $("accountMenu");
const documentInput = $("documentInput");
const uploadZone = $("uploadZone");
const verifyButton = $("verifyButton");
const publishButton = $("publishButton");
const fundButton = $("fundButton");
const sellerView = $("sellerView");
const buyerView = $("buyerView");
const exchangeView = $("exchangeView");

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function setProgress(step) {
  document.querySelectorAll(".progress-step").forEach((item, index) => {
    item.classList.toggle("active", index + 1 === step);
    item.classList.toggle("complete", index + 1 < step);
    if (index + 1 < step) item.firstElementChild.textContent = "✓";
    else item.firstElementChild.textContent = String(index + 1);
  });
  document.querySelectorAll(".progress-line").forEach((line, index) => {
    line.classList.toggle("complete", index + 1 < step);
  });
}

function syncListingPreview() {
  const eventName = $("eventName").value;
  const eventDate = new Date(`${$("eventDate").value}T12:00:00`);
  const dateLabel = Number.isNaN(eventDate.getTime())
    ? "Date to be confirmed"
    : eventDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const quantity = Number($("quantity").value);
  const price = Number($("price").value) || 0;
  const total = quantity * price;

  $("buyerEventName").textContent = eventName;
  $("buyerVenue").textContent = `${$("venue").value} · ${dateLabel}`;
  $("buyerSeats").textContent = $("seats").value;
  $("buyerQuantity").textContent = quantity;
  $("buyerUnitPrice").textContent = price.toFixed(0);
  $("subtotal").textContent = `${total.toFixed(2)} USDC`;
  $("total").textContent = `${total.toFixed(2)} USDC`;
  $("reservedAmount").textContent = `${total.toFixed(2)} demo USDC`;
}

function switchAccount(account) {
  state.account = account;
  const isSeller = account === "seller";

  $("accountName").textContent = isSeller ? "Elena V." : "Jordan M.";
  $("accountRole").textContent = isSeller ? "Seller account" : "Buyer account";
  $("accountAvatar").textContent = isSeller ? "EV" : "JM";
  $("accountAvatar").className = `avatar ${isSeller ? "seller-avatar" : "buyer-avatar"}`;

  document.querySelectorAll(".account-option").forEach((option) => {
    option.classList.toggle("active", option.dataset.account === account);
  });

  sellerView.hidden = !isSeller;
  buyerView.hidden = isSeller || state.funded;
  exchangeView.hidden = !state.funded;

  if (state.funded) {
    $("pageTitle").textContent = "Exchange in progress";
    $("pageSubtitle").textContent = "Demo funds are reserved while the ticket transfer is completed.";
    setProgress(4);
  } else if (isSeller) {
    $("pageTitle").textContent = state.published ? "Your ticket is live" : "Verify and list your ticket";
    $("pageSubtitle").textContent = "Upload proof of purchase. We’ll compare it with your listing before it reaches the marketplace.";
    setProgress(state.published ? 2 : 1);
  } else {
    $("pageTitle").textContent = "Buy with confidence";
    $("pageSubtitle").textContent = state.published
      ? "Review the verified listing and fund a simulated exchange."
      : "The seller must publish a verified ticket before checkout.";
    setProgress(3);
  }

  fundButton.disabled = !state.published;
  fundButton.textContent = state.published ? "Fund demo exchange  →" : "Waiting for seller to publish";
  accountMenu.hidden = true;
  accountButton.setAttribute("aria-expanded", "false");
}

function handleFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast("That file is over the 10 MB demo limit.");
    return;
  }

  state.documentSelected = true;
  uploadZone.classList.add("has-file");
  $("uploadTitle").textContent = file.name;
  $("uploadHint").textContent = `${(file.size / 1024).toFixed(0)} KB · Ready for simulated verification`;
  verifyButton.disabled = false;
  $("verifyStatus").textContent = "Ready";
  $("verifyStatus").className = "status working";
}

accountButton.addEventListener("click", () => {
  accountMenu.hidden = !accountMenu.hidden;
  accountButton.setAttribute("aria-expanded", String(!accountMenu.hidden));
});

document.querySelectorAll(".account-option").forEach((option) => {
  option.addEventListener("click", () => switchAccount(option.dataset.account));
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".account-switcher")) {
    accountMenu.hidden = true;
    accountButton.setAttribute("aria-expanded", "false");
  }
});

documentInput.addEventListener("change", () => handleFile(documentInput.files[0]));
["dragenter", "dragover"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove("dragover");
  });
});
uploadZone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));

verifyButton.addEventListener("click", () => {
  if (!state.documentSelected || state.verified) return;
  verifyButton.disabled = true;
  verifyButton.textContent = "Analyzing document…";
  $("verifyStatus").textContent = "Checking";

  setTimeout(() => {
    state.verified = true;
    $("verificationResult").hidden = false;
    $("verifyStatus").textContent = "Verified";
    $("verifyStatus").className = "status success";
    verifyButton.textContent = "Document verified  ✓";
    publishButton.disabled = false;
    publishButton.textContent = "Publish verified listing  →";
    setProgress(2);
    showToast("Demo verification passed. Your listing is ready to publish.");
  }, 1200);
});

$("listingForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.verified) return;
  syncListingPreview();
  state.published = true;
  $("listingStatus").textContent = "Live";
  $("listingStatus").className = "status success";
  publishButton.textContent = "Listing published  ✓";
  publishButton.disabled = true;
  $("pageTitle").textContent = "Your ticket is live";
  showToast("Listing published. Switch to Jordan to continue the demo.");
  setTimeout(() => {
    accountMenu.hidden = false;
    accountButton.setAttribute("aria-expanded", "true");
  }, 500);
});

document.querySelectorAll("#listingForm input, #listingForm select").forEach((field) => {
  field.addEventListener("input", syncListingPreview);
});

fundButton.addEventListener("click", () => {
  if (!state.published || state.funded) return;
  fundButton.disabled = true;
  fundButton.textContent = "Reserving demo funds…";

  setTimeout(() => {
    state.funded = true;
    buyerView.hidden = true;
    exchangeView.hidden = false;
    $("pageTitle").textContent = "Exchange in progress";
    $("pageSubtitle").textContent = "Demo funds are reserved while the ticket transfer is completed.";
    setProgress(4);
    showToast("Pseudo-payment complete. No real funds were moved.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 1000);
});

$("resetDemo").addEventListener("click", () => {
  state.documentSelected = false;
  state.verified = false;
  state.published = false;
  state.funded = false;
  documentInput.value = "";
  uploadZone.classList.remove("has-file");
  $("uploadTitle").textContent = "Drop your document here";
  $("uploadHint").textContent = "or click to browse · PNG, JPG, WEBP or PDF · max 10 MB";
  $("verificationResult").hidden = true;
  $("verifyStatus").textContent = "Not submitted";
  $("verifyStatus").className = "status neutral";
  $("listingStatus").textContent = "Draft";
  $("listingStatus").className = "status neutral";
  verifyButton.disabled = true;
  verifyButton.textContent = "Verify document  →";
  publishButton.disabled = true;
  publishButton.textContent = "Verify before publishing";
  switchAccount("seller");
  showToast("Demo reset.");
});

syncListingPreview();
switchAccount("seller");
