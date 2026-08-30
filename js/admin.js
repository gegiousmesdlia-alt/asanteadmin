import { auth, db, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, orderBy, query, where, serverTimestamp, setDoc
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
  if (tab === "settings") return renderSettings();
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
        <button class="btn outline" id="seed-demo">Seed 24 preview reviews (demo only)</button>
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
      <div class="field"><label>Property (optional)</label><input id="r-property" value="${review?.propertyLabel || ""}" placeholder="e.g. 2-bed apartment, Austin"></div>
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
  if (!confirm("This adds 24 clearly-labeled DEMO reviews so you can preview how the site looks under real volume. They are NOT real customers — delete them from this tab before the site goes live. Continue?")) return;

  const demoReviews = [
    {
      displayName: "Diane R.", rating: 5, propertyLabel: "2-bed apartment, Austin, TX",
      text: "The apartment I bought is exactly the way it was described and the surroundings are peaceful — it matches the quiet I wanted for this stage of life. The only reason I'm not at five stars on speed is the paperwork took a little longer than I expected, but the team kept me updated the whole way.",
      approved: true, verified: true, demo: true,
      adminReply: "Thank you, Diane — glad the place has been everything you hoped for. We're working on tightening our paperwork turnaround."
    },
    {
      displayName: "Marcus T.", rating: 4, propertyLabel: "1-bed unit, Denver, CO",
      text: "Good experience overall. The agent was responsive and the viewing was easy to book. I did have a small mix-up with the initial booking fee receipt but it was sorted within a day once I raised it.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Karen L.", rating: 5, propertyLabel: "3-bed townhome, Phoenix, AZ",
      text: "This is my second purchase through this agency and both times the title verification gave me real peace of mind before I paid anything. The BTC payment option was a nice surprise too — settled the booking fee in about twenty minutes.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Steven B.", rating: 3, propertyLabel: "Studio apartment, Tampa, FL",
      text: "The unit itself is fine and matches the listing photos. What I'd flag for others is that the building's parking situation wasn't mentioned upfront and I had to ask directly. Would appreciate more detail on amenities in future listings.",
      approved: true, verified: true, demo: true, adminReply: "Fair point, Steven — we're updating our listing template to include parking and amenities as standard fields."
    },
    {
      displayName: "Patricia N.", rating: 4, propertyLabel: "2-bed condo, Charlotte, NC",
      text: "I have a few names I'd like to correct on my documentation — do I still need your office for that, or should I go through a separate legal service to get it amended?",
      approved: true, verified: true, demo: true,
      adminReply: "You can start with us, Patricia — send the correction request to hello@asanteandgrove.example and we'll tell you whether it's something our office handles directly or where to go if it needs outside legal input."
    },
    {
      displayName: "Gerald M.", rating: 5, propertyLabel: "1-bed apartment for rent, Raleigh, NC",
      text: "Renting through here was much smoother than I expected. Clear lease terms, no hidden charges, and the agent actually showed up on time for the viewing — which apparently is rare.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Linda H.", rating: 5, propertyLabel: "3-bed single-family home, Nashville, TN",
      text: "Closing took under three weeks from offer to keys, which I wasn't expecting for a first-time buyer. The agent walked me through every document before I signed anything, which made the whole process much less intimidating.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Robert W.", rating: 4, propertyLabel: "2-bed apartment, Portland, OR",
      text: "Location is unbeatable and the unit is well kept. Only knock is it can get noisy on weekends since it's right above the ground-floor retail space — worth mentioning to anyone who works early mornings.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Susan D.", rating: 5, propertyLabel: "4-bed single-family home, San Antonio, TX",
      text: "We specifically needed to be in a certain school district and the agent found us three options within a week that fit both that and our budget. Genuinely felt like someone was listening instead of just sending listings.",
      approved: true, verified: true, demo: true, adminReply: "That means a lot, Susan — glad the school district search worked out for your family."
    },
    {
      displayName: "James F.", rating: 3, propertyLabel: "Studio apartment, Indianapolis, IN",
      text: "The apartment is as advertised, but the building's elevator has been out of service twice since I moved in three months ago, and I'm on the 6th floor. Management in the building itself has been slow to respond, separate from the agency.",
      approved: true, verified: true, demo: true,
      adminReply: "Sorry to hear this, James — we've flagged the elevator issue with the building manager on your behalf and will follow up until it's resolved."
    },
    {
      displayName: "Barbara G.", rating: 5, propertyLabel: "2-bed duplex, Sacramento, CA",
      text: "Every email I sent got a same-day reply, which after renting through two other agencies previously, was honestly the biggest selling point for me. The unit itself is clean and exactly matched the listing.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "William J.", rating: 2, propertyLabel: "1-bed apartment for rent, Kansas City, MO",
      text: "The AC unit stopped working within the first week of my lease and it took almost ten days to get someone out to fix it during a very hot stretch. The apartment itself is nice but that response time was a real problem.",
      approved: true, verified: true, demo: true,
      adminReply: "This isn't the experience we want for new tenants, William — we're following up with the maintenance contractor directly and reviewing our response-time policy for AC and heating issues specifically."
    },
    {
      displayName: "Nancy C.", rating: 5, propertyLabel: "3-bed townhome, Orlando, FL",
      text: "Paid the booking fee in BTC out of curiosity more than necessity and it went through faster than a bank transfer would have. Everything after that — inspection, closing — was straightforward with no last-minute fees added on.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Richard P.", rating: 4, propertyLabel: "2-bed condo, Pittsburgh, PA",
      text: "The agent helped us negotiate the price down a bit after the inspection turned up a few minor items, which we appreciated. Communication was solid throughout, just occasionally slow on weekends.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Betty E.", rating: 5, propertyLabel: "1-bed condo, Cincinnati, OH",
      text: "My husband and I are retired and wanted somewhere quiet with minimal upkeep. This building has been exactly that — friendly neighbors, well maintained, and the agent never once made us feel rushed during viewings, which we appreciated at our pace.",
      approved: true, verified: true, demo: true,
      adminReply: "Thank you, Betty — really glad it's been a comfortable fit for you both."
    },
    {
      displayName: "Charles O.", rating: 3, propertyLabel: "2-bed apartment, Salt Lake City, UT",
      text: "Had an issue where my assigned parking spot was already occupied by another resident's car when I moved in, and it took the leasing office a few days to sort out. The unit itself has been fine since then.",
      approved: true, verified: true, demo: true,
      adminReply: "Apologies for that mix-up at move-in, Charles — glad it got sorted, and we've asked the leasing office to double-check spot assignments before handover going forward."
    },
    {
      displayName: "Sandra Y.", rating: 5, propertyLabel: "3-bed single-family home, Albuquerque, NM",
      text: "I asked a lot of questions as a first-time buyer, probably more than most clients, and never once felt like I was being rushed through anything. The agent explained every line of the closing costs before I signed.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Thomas V.", rating: 4, propertyLabel: "Studio apartment for rent, Richmond, VA",
      text: "Good value for the area and move-in was easy. Walls are a bit thin so I can hear the neighbor's TV some evenings, but for the price and location I'm not complaining much.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Donna M.", rating: 5, propertyLabel: "2-bed townhome, Boise, ID",
      text: "Move-in ready exactly as promised — no last-minute repairs I had to chase down, no surprise charges on the final invoice. After a rough experience with a different agency last year, this was a relief.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Joseph K.", rating: 1, propertyLabel: "1-bed apartment, Columbus, OH",
      text: "I paid a booking fee to secure a viewing and then the listing was marked unavailable two days later with no explanation and no refund processed for almost three weeks. Had to follow up multiple times to get it resolved.",
      approved: true, verified: true, demo: true,
      adminReply: "Joseph, this fell well short of what we expect from ourselves — a delayed refund on a cancelled booking is on us. We've since changed our process so refunds trigger automatically the same day a listing is pulled, and we've reached out to make sure yours was fully resolved."
    },
    {
      displayName: "Carol H.", rating: 4, propertyLabel: "3-bed single-family home, Denver, CO",
      text: "The title verification step gave me real confidence before committing to an offer — my brother had issues with a title dispute on his own home purchase elsewhere, so I was glad this was checked upfront.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Daniel S.", rating: 5, propertyLabel: "2-bed apartment, Tampa, FL",
      text: "Booked a viewing on a Tuesday and was signing paperwork by Friday. I've rented through slower agencies before and the turnaround here was genuinely refreshing.",
      approved: true, verified: true, demo: true, adminReply: ""
    },
    {
      displayName: "Ruth W.", rating: 3, propertyLabel: "1-bed condo, Austin, TX",
      text: "The unit is nice but the listed square footage was noticeably off from what an independent appraiser measured later — not a dealbreaker for me, but worth double-checking listing measurements before finalizing anything.",
      approved: true, verified: true, demo: true,
      adminReply: "Thanks for flagging this, Ruth — we're re-verifying square footage on our active listings against appraisal data to catch discrepancies like this going forward."
    },
    {
      displayName: "Kenneth B.", rating: 5, propertyLabel: "2-bed duplex, Phoenix, AZ",
      text: "What stood out most was the agent checking in about two weeks after move-in just to see how things were going, with no sales pitch attached. Small thing, but it made the whole experience feel less transactional.",
      approved: true, verified: true, demo: true, adminReply: ""
    }
  ];

  for (const r of demoReviews) {
    await addDoc(collection(db, "reviews"), { ...r, createdAt: serverTimestamp() });
  }
  renderReviews();
}

// ---------- Settings (admin-managed third-party API keys) ----------
// Stored at Firestore doc settings/integrations, locked to admin read/write
// by firestore.rules. The serverless /api/external-listings function reads
// this same document server-side via the Firebase Admin SDK (bypassing
// rules with a service account), so this key never touches the browser of
// a public site visitor — only your own authenticated admin session ever
// sees the full value here.
function maskKey(key) {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return key.slice(0, 4) + "•".repeat(Math.max(4, key.length - 8)) + key.slice(-4);
}

async function renderSettings() {
  main.innerHTML = `
    <h1>Settings</h1>
    <div class="panel" style="max-width:560px; margin-bottom:24px;">
      <h3 style="margin:0 0 6px; font-family:var(--font-body); font-weight:600; text-transform:none; font-size:1.05rem;">Site-wide discount</h3>
      <p style="font-family:var(--font-mono); font-size:0.78rem; color:var(--muted); margin:0 0 18px;">
        Applies to <strong>your own listings</strong> everywhere their price shows (home, listings, listing detail).
        Enter what buyers should pay AS A PERCENT OF the original price — e.g. 70 shows 70% of the price (a 30% discount), with the original price struck through.
        <br><br>
        On the Nationwide Search marketplace page, the real Realtor.com/Redfin/Apartments.com price is always shown too (struck through) — the discounted number is clearly labeled "your price with us," so it's presented as this agency covering part of the cost for the buyer, not as the property's actual market price changing.
      </p>
      <div id="current-discount-display" style="font-family:var(--font-mono); font-size:0.85rem; margin-bottom:16px;">Loading…</div>
      <div class="field"><label>New percentage (1–99)</label><input id="discount-input" type="number" min="1" max="99" placeholder="e.g. 70"></div>
      <div class="toolbar">
        <button class="btn danger" id="clear-discount" style="display:none;">Remove discount</button>
        <button class="btn" id="save-discount">Apply discount</button>
      </div>
      <p id="discount-status" style="font-family:var(--font-mono); font-size:0.78rem; margin-top:14px;"></p>
    </div>

    <div class="panel" style="max-width:560px;">
      <h3 style="margin:0 0 6px; font-family:var(--font-body); font-weight:600; text-transform:none; font-size:1.05rem;">RealtyAPI.io key</h3>
      <p style="font-family:var(--font-mono); font-size:0.78rem; color:var(--muted); margin:0 0 18px;">
        Powers the "Nationwide Search" marketplace page (Realtor.com, Redfin, Apartments.com).
        Stored in Firestore, admin-only — never exposed to site visitors.
      </p>
      <div id="current-key-display" style="font-family:var(--font-mono); font-size:0.85rem; margin-bottom:16px;">Loading…</div>
      <div class="field"><label>New key</label><input id="realty-key-input" type="text" placeholder="rt_..."></div>
      <div class="toolbar">
        <button class="btn danger" id="clear-key" style="display:none;">Remove key</button>
        <button class="btn" id="save-key">Save key</button>
      </div>
      <p id="key-status" style="font-family:var(--font-mono); font-size:0.78rem; margin-top:14px;"></p>
    </div>`;

  // --- discount ---
  const discountDisplay = document.getElementById("current-discount-display");
  const clearDiscountBtn = document.getElementById("clear-discount");
  const discountStatus = document.getElementById("discount-status");

  try {
    const snap = await getDoc(doc(db, "settings", "promotions"));
    const pct = snap.exists() ? snap.data().discountPercent : null;
    if (typeof pct === "number" && pct > 0 && pct < 100) {
      discountDisplay.textContent = `Active: showing at ${pct}% of original price (${100 - pct}% off).`;
      clearDiscountBtn.style.display = "inline-flex";
    } else {
      discountDisplay.textContent = "No discount currently active.";
      clearDiscountBtn.style.display = "none";
    }
  } catch {
    discountDisplay.textContent = "Could not load current setting.";
  }

  document.getElementById("save-discount").addEventListener("click", async () => {
    const raw = document.getElementById("discount-input").value;
    const value = Number(raw);
    if (!raw || isNaN(value) || value <= 0 || value >= 100) {
      discountStatus.textContent = "Enter a number between 1 and 99.";
      return;
    }
    discountStatus.textContent = "Saving…";
    try {
      await setDoc(doc(db, "settings", "promotions"), { discountPercent: value }, { merge: true });
      discountStatus.textContent = "Saved.";
      renderSettings();
    } catch (err) {
      discountStatus.textContent = "Could not save: " + err.message;
    }
  });

  clearDiscountBtn.addEventListener("click", async () => {
    if (!confirm("Remove the site-wide discount? Prices will go back to normal everywhere.")) return;
    try {
      await setDoc(doc(db, "settings", "promotions"), { discountPercent: null }, { merge: true });
      renderSettings();
    } catch (err) {
      discountStatus.textContent = "Could not remove: " + err.message;
    }
  });

  // --- RealtyAPI key ---
  const display = document.getElementById("current-key-display");
  const clearBtn = document.getElementById("clear-key");
  const statusEl = document.getElementById("key-status");
  let existing = "";

  try {
    const snap = await getDoc(doc(db, "settings", "integrations"));
    existing = snap.exists() ? (snap.data().realtyApiKey || "") : "";
    display.textContent = existing ? `Current key: ${maskKey(existing)}` : "No key saved yet.";
    clearBtn.style.display = existing ? "inline-flex" : "none";
  } catch (err) {
    display.textContent = "Could not load current setting.";
  }

  document.getElementById("save-key").addEventListener("click", async () => {
    const value = document.getElementById("realty-key-input").value.trim();
    if (!value) { statusEl.textContent = "Enter a key before saving."; return; }
    statusEl.textContent = "Saving…";
    try {
      await setDoc(doc(db, "settings", "integrations"), { realtyApiKey: value }, { merge: true });
      statusEl.textContent = "Saved.";
      renderSettings();
    } catch (err) {
      statusEl.textContent = "Could not save: " + err.message;
    }
  });

  clearBtn.addEventListener("click", async () => {
    if (!confirm("Remove the saved RealtyAPI key? The Nationwide Search page will stop returning results until a new one is saved.")) return;
    try {
      await setDoc(doc(db, "settings", "integrations"), { realtyApiKey: "" }, { merge: true });
      renderSettings();
    } catch (err) {
      statusEl.textContent = "Could not remove: " + err.message;
    }
  });
}
