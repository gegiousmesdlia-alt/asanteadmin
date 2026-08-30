import { auth, db, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, orderBy, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const loginScreen = document.getElementById("login-screen");
const dashboard = document.getElementById("dashboard");
const main = document.getElementById("main");
const loginError = document.getElementById("login-error");

// ---------- auth gate ----------
// Access is restricted to UIDs present in the "admins" collection.
// Add a document at admins/{uid} (any fields) via the Firebase console
// for each staff member allowed into this panel.
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.style.display = "none";
  try {
    await signInWithEmailAndPassword(auth, document.getElementById("a-email").value, document.getElementById("a-pass").value);
  } catch {
    loginError.textContent = "Sign-in failed. Check the email and password.";
    loginError.style.display = "block";
  }
});

document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) { loginScreen.style.display = "flex"; dashboard.style.display = "none"; return; }
  const adminDoc = await getDoc(doc(db, "admins", user.uid));
  if (!adminDoc.exists()) {
    loginError.textContent = "This account is not authorized for the admin panel.";
    loginError.style.display = "block";
    await signOut(auth);
    return;
  }
  loginScreen.style.display = "none";
  dashboard.style.display = "block";
  renderTab("listings");
});

// ---------- tabs ----------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderTab(btn.dataset.tab);
  });
});

function renderTab(tab) {
  if (tab === "listings") return renderListings();
  if (tab === "agents") return renderAgents();
  if (tab === "enquiries") return renderEnquiries();
  if (tab === "bookings") return renderBookings();
  if (tab === "reviews") return renderReviews();
}

// ---------- Cloudinary upload ----------
async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: fd });
  if (!res.ok) throw new Error("Cloudinary upload failed");
  const data = await res.json();
  return data.secure_url;
}

// ---------- Listings ----------
async function renderListings() {
  main.innerHTML = `
    <div class="toolbar"><h1>Listings</h1><button class="btn" id="new-listing">+ New listing</button></div>
    <div class="panel"><table class="tbl" id="listings-table">
      <thead><tr><th>Photo</th><th>Title</th><th>Type</th><th>Price</th><th>Location</th><th></th></tr></thead>
      <tbody><tr><td colspan="6">Loading…</td></tr></tbody>
    </table></div>`;

  const snap = await getDocs(query(collection(db, "listings"), orderBy("createdAt", "desc")));
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const tbody = document.querySelector("#listings-table tbody");
  tbody.innerHTML = rows.length ? rows.map(l => `
    <tr>
      <td>${l.images?.[0] ? `<img src="${l.images[0]}">` : "—"}</td>
      <td>${l.title || ""}</td>
      <td><span class="badge ${l.listingType === "rent" ? "rent" : ""}">${l.listingType || "sale"}</span></td>
      <td>$${(l.price || 0).toLocaleString()}</td>
      <td>${l.location || ""}</td>
      <td style="text-align:right; white-space:nowrap;">
        <button class="btn small outline" data-edit="${l.id}">Edit</button>
        <button class="btn small danger" data-del="${l.id}">Delete</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="6">No listings yet.</td></tr>`;

  tbody.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openListingModal(rows.find(r => r.id === b.dataset.edit))));
  tbody.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (confirm("Delete this listing permanently?")) { await deleteDoc(doc(db, "listings", b.dataset.del)); renderListings(); }
  }));
  document.getElementById("new-listing").addEventListener("click", () => openListingModal(null));
}

function openListingModal(listing) {
  const isEdit = !!listing;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h1 style="font-size:1.3rem;">${isEdit ? "Edit listing" : "New listing"}</h1>
      <div class="form-grid">
        <div class="field"><label>Title</label><input id="f-title" value="${listing?.title || ""}"></div>
        <div class="field"><label>Location</label><input id="f-location" value="${listing?.location || ""}"></div>
        <div class="field"><label>Type</label>
          <select id="f-type"><option value="sale" ${listing?.listingType === "sale" ? "selected" : ""}>Sale</option><option value="rent" ${listing?.listingType === "rent" ? "selected" : ""}>Rent</option></select>
        </div>
        <div class="field"><label>Price (USD)</label><input id="f-price" type="number" value="${listing?.price || ""}"></div>
        <div class="field"><label>Bedrooms</label><input id="f-beds" type="number" value="${listing?.beds ?? ""}"></div>
        <div class="field"><label>Bathrooms</label><input id="f-baths" type="number" value="${listing?.baths ?? ""}"></div>
        <div class="field"><label>Size (m²)</label><input id="f-size" type="number" value="${listing?.sizeSqm ?? ""}"></div>
        <div class="field"><label>Booking fee (USD)</label><input id="f-fee" type="number" value="${listing?.bookingFeeUsd ?? 50}"></div>
        <div class="field"><label>Agent name</label><input id="f-agent" value="${listing?.agentName || ""}"></div>
        <div class="field"><label>Title status</label><input id="f-title-status" value="${listing?.titleStatus || "Verified"}"></div>
      </div>
      <div class="field"><label>Description</label><textarea id="f-desc">${listing?.description || ""}</textarea></div>
      <div class="field"><label>Photos</label><input id="f-images" type="file" multiple accept="image/*"></div>
      <p style="font-family:var(--font-mono); font-size:0.74rem; color:var(--muted);">${listing?.images?.length || 0} photo(s) currently attached. New uploads are added to the listing.</p>
      <div class="toolbar" style="margin-top:20px;">
        <button class="btn outline" id="modal-cancel">Cancel</button>
        <button class="btn" id="modal-save">Save listing</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#modal-cancel").addEventListener("click", () => backdrop.remove());

  backdrop.querySelector("#modal-save").addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Saving…";
    try {
      const files = backdrop.querySelector("#f-images").files;
      const uploaded = [];
      for (const file of files) uploaded.push(await uploadToCloudinary(file));

      const payload = {
        title: backdrop.querySelector("#f-title").value,
        location: backdrop.querySelector("#f-location").value,
        listingType: backdrop.querySelector("#f-type").value,
        price: Number(backdrop.querySelector("#f-price").value || 0),
        beds: Number(backdrop.querySelector("#f-beds").value || 0),
        baths: Number(backdrop.querySelector("#f-baths").value || 0),
        sizeSqm: Number(backdrop.querySelector("#f-size").value || 0),
        bookingFeeUsd: Number(backdrop.querySelector("#f-fee").value || 50),
        agentName: backdrop.querySelector("#f-agent").value,
        titleStatus: backdrop.querySelector("#f-title-status").value,
        description: backdrop.querySelector("#f-desc").value,
        images: [...(listing?.images || []), ...uploaded]
      };

      if (isEdit) {
        await updateDoc(doc(db, "listings", listing.id), payload);
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, "listings"), payload);
      }
      backdrop.remove();
      renderListings();
    } catch (err) {
      alert("Could not save listing: " + err.message);
      e.target.disabled = false;
      e.target.textContent = "Save listing";
    }
  });
}

// ---------- Agents ----------
async function renderAgents() {
  main.innerHTML = `
    <div class="toolbar"><h1>Agents</h1><button class="btn" id="new-agent">+ New agent</button></div>
    <div class="panel"><table class="tbl" id="agents-table">
      <thead><tr><th>Photo</th><th>Name</th><th>Role</th><th>Email</th><th></th></tr></thead>
      <tbody><tr><td colspan="5">Loading…</td></tr></tbody>
    </table></div>`;

  const snap = await getDocs(collection(db, "agents"));
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const tbody = document.querySelector("#agents-table tbody");
  tbody.innerHTML = rows.length ? rows.map(a => `
    <tr>
      <td>${a.photo ? `<img src="${a.photo}">` : "—"}</td>
      <td>${a.name || ""}</td>
      <td>${a.role || ""}</td>
      <td>${a.email || ""}</td>
      <td style="text-align:right;">
        <button class="btn small outline" data-edit="${a.id}">Edit</button>
        <button class="btn small danger" data-del="${a.id}">Delete</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="5">No agents yet.</td></tr>`;

  tbody.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openAgentModal(rows.find(r => r.id === b.dataset.edit))));
  tbody.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (confirm("Remove this agent?")) { await deleteDoc(doc(db, "agents", b.dataset.del)); renderAgents(); }
  }));
  document.getElementById("new-agent").addEventListener("click", () => openAgentModal(null));
}

function openAgentModal(agent) {
  const isEdit = !!agent;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <h1 style="font-size:1.3rem;">${isEdit ? "Edit agent" : "New agent"}</h1>
      <div class="field"><label>Name</label><input id="g-name" value="${agent?.name || ""}"></div>
      <div class="field"><label>Role</label><input id="g-role" value="${agent?.role || "Sales agent"}"></div>
      <div class="field"><label>Email</label><input id="g-email" value="${agent?.email || ""}"></div>
      <div class="field"><label>Bio</label><textarea id="g-bio">${agent?.bio || ""}</textarea></div>
      <div class="field"><label>Photo</label><input id="g-photo" type="file" accept="image/*"></div>
      <div class="toolbar">
        <button class="btn outline" id="modal-cancel">Cancel</button>
        <button class="btn" id="modal-save">Save agent</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#modal-cancel").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#modal-save").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const file = backdrop.querySelector("#g-photo").files[0];
      const photo = file ? await uploadToCloudinary(file) : (agent?.photo || "");
      const payload = {
        name: backdrop.querySelector("#g-name").value,
        role: backdrop.querySelector("#g-role").value,
        email: backdrop.querySelector("#g-email").value,
        bio: backdrop.querySelector("#g-bio").value,
        photo
      };
      if (isEdit) await updateDoc(doc(db, "agents", agent.id), payload);
      else await addDoc(collection(db, "agents"), payload);
      backdrop.remove();
      renderAgents();
    } catch (err) {
      alert("Could not save agent: " + err.message);
      e.target.disabled = false;
    }
  });
}

// ---------- Enquiries ----------
async function renderEnquiries() {
  main.innerHTML = `<h1>Enquiries</h1><div class="panel"><table class="tbl" id="enq-table">
    <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Message</th></tr></thead>
    <tbody><tr><td colspan="4">Loading…</td></tr></tbody></table></div>`;
  const snap = await getDocs(query(collection(db, "enquiries"), orderBy("createdAt", "desc")));
  const rows = snap.docs.map(d => d.data());
  document.querySelector("#enq-table tbody").innerHTML = rows.length ? rows.map(r => `
    <tr><td>${r.name || ""}</td><td>${r.email || ""}</td><td>${r.phone || ""}</td><td>${r.message || ""}</td></tr>
  `).join("") : `<tr><td colspan="4">No enquiries yet.</td></tr>`;
}

// ---------- Bookings & BTC payments ----------
async function renderBookings() {
  main.innerHTML = `<h1>Bookings &amp; BTC payments</h1><div class="panel"><table class="tbl" id="book-table">
    <thead><tr><th>Order ID</th><th>Listing</th><th>Amount</th><th>Status</th></tr></thead>
    <tbody><tr><td colspan="4">Loading…</td></tr></tbody></table></div>
    <p style="font-family:var(--font-mono); font-size:0.78rem; color:var(--muted); margin-top:14px;">
      Populated by the /api/btc-webhook function once NOWPAYMENTS_IPN_SECRET is configured and the webhook is wired to write into the "bookings" collection.
    </p>`;
  try {
    const snap = await getDocs(query(collection(db, "bookings"), orderBy("createdAt", "desc")));
    const rows = snap.docs.map(d => d.data());
    document.querySelector("#book-table tbody").innerHTML = rows.length ? rows.map(r => `
      <tr><td>${r.orderId || ""}</td><td>${r.listingId || ""}</td><td>$${r.amountUsd || 0}</td>
      <td><span class="badge ${r.status === "finished" ? "paid" : "pending"}">${r.status || "pending"}</span></td></tr>
    `).join("") : `<tr><td colspan="4">No bookings recorded yet.</td></tr>`;
  } catch {
    document.querySelector("#book-table tbody").innerHTML = `<tr><td colspan="4">No "bookings" collection yet.</td></tr>`;
  }
}

// ---------- Reviews ----------
// Real reviews should come from signed-in buyers after a completed booking
// (build that submission flow before launch). Until then, admins can write
// reviews manually here (e.g. transcribed from a phone call with a past
// client), reply to any review, and toggle what's published on the site.
//
// The "Seed preview reviews" button is for LAYOUT CHECKING ONLY — it fills
// the reviews list with clearly-labeled demo entries so you can see spacing,
// star ratings, and reply threads with real content in place. Every demo
// entry is tagged demo:true and shown with a red DEMO badge here. Delete
// them (button provided) before the site goes live — publishing invented
// reviews as if from real customers is not something to ship.
async function renderReviews() {
  main.innerHTML = `
    <div class="toolbar"><h1>Reviews</h1>
      <div style="display:flex; gap:10px;">
        <button class="btn outline" id="seed-demo">Seed 6 preview reviews (demo only)</button>
        <button class="btn" id="new-review">+ Add review manually</button>
      </div>
    </div>
    <div class="demo-banner" id="demo-warning" style="display:none;">
      <strong>Demo data present.</strong> Rows marked <span class="badge demo">DEMO</span> are fabricated preview content for checking the layout — not real customers. Delete every demo row (button in each row) before this site goes live.
    </div>
    <div class="panel"><table class="tbl" id="reviews-table">
      <thead><tr><th>Buyer</th><th>Rating</th><th>Review</th><th>Published</th><th></th></tr></thead>
      <tbody><tr><td colspan="5">Loading…</td></tr></tbody>
    </table></div>`;

  document.getElementById("seed-demo").addEventListener("click", seedDemoReviews);
  document.getElementById("new-review").addEventListener("click", () => openReviewModal(null));

  const snap = await getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc")));
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  document.getElementById("demo-warning").style.display = rows.some(r => r.demo) ? "block" : "none";

  const tbody = document.querySelector("#reviews-table tbody");
  tbody.innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${r.displayName || ""} ${r.demo ? '<span class="badge demo">DEMO</span>' : ""}</td>
      <td><span class="stars-admin">${"★".repeat(r.rating||0)}${"☆".repeat(5-(r.rating||0))}</span></td>
      <td style="max-width:340px;">${(r.text||"").slice(0,140)}${(r.text||"").length>140?"…":""}${r.adminReply ? `<br><em style="color:var(--muted); font-size:0.8rem;">Replied</em>` : ""}</td>
      <td><span class="badge ${r.approved ? "paid" : "pending"}">${r.approved ? "Published" : "Hidden"}</span></td>
      <td style="text-align:right; white-space:nowrap;">
        <button class="btn small outline" data-toggle="${r.id}" data-approved="${r.approved}">${r.approved ? "Unpublish" : "Publish"}</button>
        <button class="btn small outline" data-reply="${r.id}">Reply</button>
        <button class="btn small danger" data-del="${r.id}">Delete</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="5">No reviews yet.</td></tr>`;

  tbody.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", async () => {
    await updateDoc(doc(db, "reviews", b.dataset.toggle), { approved: b.dataset.approved !== "true" });
    renderReviews();
  }));
  tbody.querySelectorAll("[data-reply]").forEach(b => b.addEventListener("click", () => openReplyModal(rows.find(r => r.id === b.dataset.reply))));
  tbody.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (confirm("Delete this review permanently?")) { await deleteDoc(doc(db, "reviews", b.dataset.del)); renderReviews(); }
  }));
}

function openReviewModal(review) {
  const isEdit = !!review;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <h1 style="font-size:1.3rem;">${isEdit ? "Edit review" : "Add review manually"}</h1>
      <p style="font-family:var(--font-mono); font-size:0.76rem; color:var(--muted);">Use first name + last initial only (e.g. "Adaeze O.") — never a full name, for the buyer's privacy.</p>
      <div class="field"><label>Display name</label><input id="r-name" value="${review?.displayName || ""}" placeholder="e.g. Adaeze O."></div>
      <div class="field"><label>Rating</label>
        <select id="r-rating">${[5,4,3,2,1].map(n => `<option value="${n}" ${review?.rating===n?"selected":""}>${n} star${n>1?"s":""}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Property (optional)</label><input id="r-property" value="${review?.propertyLabel || ""}" placeholder="e.g. 3-bed apartment, Maitama"></div>
      <div class="field"><label>Review text</label><textarea id="r-text">${review?.text || ""}</textarea></div>
      <label style="display:flex; align-items:center; gap:8px; font-family:var(--font-mono); font-size:0.78rem; margin-bottom:16px;">
        <input type="checkbox" id="r-approved" ${review?.approved !== false ? "checked" : ""}> Publish immediately
      </label>
      <div class="toolbar">
        <button class="btn outline" id="modal-cancel">Cancel</button>
        <button class="btn" id="modal-save">Save review</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#modal-cancel").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#modal-save").addEventListener("click", async () => {
    const payload = {
      displayName: backdrop.querySelector("#r-name").value,
      rating: Number(backdrop.querySelector("#r-rating").value),
      propertyLabel: backdrop.querySelector("#r-property").value,
      text: backdrop.querySelector("#r-text").value,
      approved: backdrop.querySelector("#r-approved").checked,
      verified: true,
      demo: false
    };
    if (isEdit) await updateDoc(doc(db, "reviews", review.id), payload);
    else { payload.createdAt = serverTimestamp(); await addDoc(collection(db, "reviews"), payload); }
    backdrop.remove();
    renderReviews();
  });
}

function openReplyModal(review) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal review-reply-box" style="max-width:480px;">
      <h1 style="font-size:1.3rem;">Reply to ${review.displayName || "review"}</h1>
      <blockquote style="color:var(--muted); font-size:0.86rem; border-left:2px solid var(--line); padding-left:12px; margin:14px 0;">${review.text || ""}</blockquote>
      <div class="field"><label>Your reply (shown publicly under this review)</label><textarea id="reply-text">${review.adminReply || ""}</textarea></div>
      <div class="toolbar">
        <button class="btn outline" id="modal-cancel">Cancel</button>
        <button class="btn" id="modal-save">Save reply</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#modal-cancel").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#modal-save").addEventListener("click", async () => {
    await updateDoc(doc(db, "reviews", review.id), { adminReply: backdrop.querySelector("#reply-text").value });
    backdrop.remove();
    renderReviews();
  });
}

async function seedDemoReviews() {
  if (!confirm("This adds 6 clearly-labeled DEMO reviews so you can preview the layout. They are NOT real customers — delete them from this tab before the site goes live. Continue?")) return;

  const demoReviews = [
    {
      displayName: "Adaeze O.", rating: 5, propertyLabel: "3-bed apartment, Maitama",
      text: "The apartment I bought is exactly the way it was described and the surroundings are peaceful — it matches the quiet I wanted for this stage of life. The only reason I'm not at five stars on speed is the paperwork took a little longer than I expected, but the team kept me updated the whole way.",
      approved: true, verified: true, demo: true,
      adminReply: "Thank you, Adaeze — glad Maitama has been everything you hoped for. We're working on tightening our paperwork turnaround."
    },
    {
      displayName: "Tunde A.", rating: 4, propertyLabel: "2-bed flat, Wuse II",
      text: "Good experience overall. The agent was responsive and the viewing was easy to book. I did have a small mix-up with the initial booking fee receipt but it was sorted within a day once I raised it.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Ngozi E.", rating: 5, propertyLabel: "4-bed duplex, Guzape",
      text: "This is my second purchase through this agency and both times the title verification gave me real peace of mind before I paid anything. The BTC payment option was a nice surprise too — settled the booking fee in about twenty minutes.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Ibrahim S.", rating: 3, propertyLabel: "Studio apartment, Jabi",
      text: "The property itself is fine and matches the listing photos. What I'd flag for others is that the estate's power backup wasn't mentioned upfront and I had to ask directly. Would appreciate more detail on utilities in future listings.",
      approved: true, verified: true, demo: true, adminReply: "Fair point, Ibrahim — we're updating our listing template to include utilities and backup power as standard fields."
    },
    {
      displayName: "Chiamaka U.", rating: 4, propertyLabel: "3-bed bungalow, Gwarinpa",
      text: "I have a few names I'd like to correct on my documentation — do I still need your office for that, or should I go through a separate legal service to get it amended?",
      approved: true, verified: true, demo: true,
      adminReply: "You can start with us, Chiamaka — send the correction request to hello@asanteandgrove.example and we'll tell you whether it's something our office handles directly or where to go if it needs outside legal input."
    },
    {
      displayName: "Femi K.", rating: 5, propertyLabel: "1-bed apartment for rent, Lekki",
      text: "Renting through here was much smoother than I expected. Clear lease terms, no hidden charges, and the agent actually showed up on time for the viewing — which apparently is rare.",
      approved: true, verified: true, demo: true, adminReply: ""
    }
  ];

  for (const r of demoReviews) {
    await addDoc(collection(db, "reviews"), { ...r, createdAt: serverTimestamp() });
  }
  renderReviews();
}
