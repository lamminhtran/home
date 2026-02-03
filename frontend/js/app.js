// ====== app.js (updated to use API) ======

// ---------- DEFAULTS / STATE ----------
const DEFAULT = {
  totalBudget: 700_000_000,
  categoryLimits: {
    construction: 300_000_000,
    interior: 200_000_000,
    garden: 100_000_000,
    other: 100_000_000
  },
  expenses: []
};

// Initial state - will be populated from API
let state = JSON.parse(JSON.stringify(DEFAULT));
let categoryChart;

const token = localStorage.getItem("token");

// ---------- UTIL ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const formatMoney = n => Number(n).toLocaleString("vi-VN") + " ₫";

function showNotification(msg, type = "success", timeout = 2500) {
  const el = $("#notification");
  el.className = "notification " + (type === "success" ? "success" : type === "error" ? "error" : "info");
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => el.style.display = "none", timeout);
}

function authHeader() {
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token
  };
}

// ---------- API FUNCTIONS ----------
async function fetchData() {
  const loader = document.getElementById("loadingOverlay");
  if (loader) loader.style.display = "flex";

  try {
    const res = await fetch(`${CONFIG.API_URL}/data`, {
      headers: { "Authorization": "Bearer " + token }
    });
    
    if (res.status === 401) {
        logout();
        return;
    }

    if (!res.ok) throw new Error("Failed to fetch data");
    
    const data = await res.json();
    state = data;
    renderAll();
  } catch (err) {
    console.error(err);
    showNotification("Lỗi tải dữ liệu", "error");
  } finally {
    if (loader) loader.style.display = "none";
  }
}

// ---------- MODALS / FORMS ----------
function openExpenseModal(editId = null) {
  const form = $("#expenseForm");
  form.reset();
  $("#expense-id").value = editId || "";
  
  // Note: editId is now a string from MongoDB (_id)
  if (editId) {
    const ex = state.expenses.find(x => x.id === editId);
    if (!ex) return;
    $("#expense-category").value = ex.category;
    $("#expense-desc").value = ex.desc;
    $("#expense-amount").value = ex.amount;
    $("#expense-date").value = ex.date;
    $("#expense-notes").value = ex.notes || "";
  }
  $("#expenseModal").style.display = "flex";
}

function closeExpenseModal() {
  $("#expenseModal").style.display = "none";
  $("#expenseForm").reset();
}

function openBudgetModal() {
  $("#edit-totalBudget").value = state.totalBudget;
  $("#edit-construction").value = state.categoryLimits.construction;
  $("#edit-interior").value = state.categoryLimits.interior;
  $("#edit-garden").value = state.categoryLimits.garden;
  $("#edit-other").value = state.categoryLimits.other;
  $("#budgetModal").style.display = "flex";
}

function closeBudgetModal() {
  $("#budgetModal").style.display = "none";
  $("#budgetForm").reset();
}

// close modals on outside click
window.addEventListener("click", (e) => {
  if (e.target.id === "expenseModal") closeExpenseModal();
  if (e.target.id === "budgetModal") closeBudgetModal();
});

// ---------- EXPENSE FORM (add / edit) ----------
$("#expenseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("#expense-id").value; // string from hidden input
  constcategory = $("#expense-category").value; // typo fix in variable name? No, space was missing in thought but code is fine if I type correctly.
  const category = $("#expense-category").value;
  const desc = $("#expense-desc").value.trim();
  const amount = Number($("#expense-amount").value);
  const date = $("#expense-date").value;
  const notes = $("#expense-notes").value.trim();

  if (!category || !desc || !amount || !date) {
    showNotification("Vui lòng nhập đầy đủ thông tin", "error");
    return;
  }

  // check category limit (optimistic check using current local state)
  const spentBefore = state.expenses.filter(x => x.category === category).reduce((s,x)=>s+x.amount,0);
  // If editing, subtract old amount? A bit complex to do perfectly optimistically for edit. 
  // Let's simplified check or skip strict check for now, or assume user knows. 
  // User asked for logic, so let's keep the check but careful with edit.
  // Actually, for edit, we should subtract the OLD amount of THIS expense.
  let currentExpenseAmount = 0;
  if(id) {
      const ex = state.expenses.find(x => x.id === id);
      if(ex) currentExpenseAmount = ex.amount; 
      // If category changed, this logic is tricky. 
      // Simplified: Just warn if (total + new - old) > limit.
  }

  const categoryLimit = state.categoryLimits[category] ?? 0;
  
  // Calculate potential new total for this category
  // This is an approximation if we change category, but good enough for warning.
  const currentCategoryTotal = state.expenses.filter(x => x.category === category).reduce((s,x)=>s+x.amount,0);
  // If editing and same category, subtract old. If editing and diff category, we are adding to new category.
  // Let's keep it simple: just checking against the target category.
  
  let willBe = currentCategoryTotal + amount;
  if (id) {
     const ex = state.expenses.find(x => x.id === id);
     if (ex && ex.category === category) {
         willBe -= ex.amount;
     }
  }

  if (willBe > categoryLimit) {
    const ok = confirm(`⚠️ Khoản này sẽ vượt ngân sách hạng mục (${(willBe/1e6).toFixed(2)}tr / ${(categoryLimit/1e6).toFixed(2)}tr). Bạn có muốn tiếp tục?`);
    if (!ok) return;
  }

  // check total budget
  const totalSpent = state.expenses.reduce((s,x)=>s+x.amount,0);
  let willTotal = totalSpent + amount;
  if (id) {
      const ex = state.expenses.find(x => x.id === id);
      // Rough approx if just amount changed.
      if (ex) willTotal -= ex.amount;
  }
  
  if (willTotal > state.totalBudget) {
    const ok = confirm(`⚠️ Tổng chi sẽ vượt tổng ngân sách (${(willTotal/1e6).toFixed(2)}tr / ${(state.totalBudget/1e6).toFixed(2)}tr). Bạn có muốn tiếp tục?`);
    if (!ok) return;
  }

  const payload = { category, desc, amount, date, notes };

  try {
    let res;
    if (id) {
      // Edit
      res = await fetch(`${CONFIG.API_URL}/data/expenses/${id}`, {
        method: "PUT",
        headers: authHeader(),
        body: JSON.stringify(payload)
      });
    } else {
      // Add
      res = await fetch(`${CONFIG.API_URL}/data/expenses`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) throw new Error("API Error");

    // Reload all data to be safe and consistent
    await fetchData();
    closeExpenseModal();
    showNotification(id ? "Sửa chi phí thành công" : "Thêm chi phí thành công", "success");

  } catch (err) {
    console.error(err);
    showNotification("Có lỗi xảy ra", "error");
  }
});

// ---------- BUDGET FORM ----------
$("#budgetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const total = Number($("#edit-totalBudget").value);
  const construction = Number($("#edit-construction").value);
  const interior = Number($("#edit-interior").value);
  const garden = Number($("#edit-garden").value);
  const other = Number($("#edit-other").value);

  const sumCategories = construction + interior + garden + other;
  let finalTotal = total;

  if (sumCategories > total) {
    const ok = confirm("Tổng hạng mục lớn hơn tổng ngân sách. Bạn muốn tự động nâng tổng ngân sách lên bằng tổng hạng mục?");
    if (ok) {
      finalTotal = sumCategories;
    } else {
      showNotification("Lưu bị hủy. Hãy đảm bảo tổng hạng mục ≤ tổng ngân sách", "error");
      return;
    }
  }

  const payload = {
      totalBudget: finalTotal,
      categoryLimits: { construction, interior, garden, other }
  };

  try {
      const res = await fetch(`${CONFIG.API_URL}/data/budget`, {
          method: "PUT",
          headers: authHeader(),
          body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("API Error");
      
      await fetchData();
      closeBudgetModal();
      showNotification("Cập nhật ngân sách thành công", "success");
  } catch (err) {
      console.error(err);
      showNotification("Có lỗi xảy ra", "error");
  }
});

// ---------- DELETE ----------
async function removeExpense(id) {
    // id in DOM might be string "65a..." but onclick passed it. Ensure it's treated right.
    // In HTML generation below, we need to quote the ID since it is a string now.
    
    const ok = confirm("Bạn chắc chắn muốn xóa giao dịch này?");
    if (!ok) return;

    try {
        const res = await fetch(`${CONFIG.API_URL}/data/expenses/${id}`, {
            method: "DELETE",
            headers: authHeader()
        });

        if (!res.ok) throw new Error("API Error");

        await fetchData();
        showNotification("Xóa chi phí thành công", "success");
    } catch (err) {
        console.error(err);
        showNotification("Có lỗi xảy ra", "error");
    }
}

function editExpense(id) {
    // id is string
    openExpenseModal(id);
    $("#expense-id").value = id;
}

// ---------- FILTERS ----------
$("#category-filter").addEventListener("change", renderTableWithFilters);
$("#month-filter").addEventListener("change", renderTableWithFilters);

function clearFilters() {
  $("#category-filter").value = "all";
  $("#month-filter").value = "";
  renderTableWithFilters();
}

// ---------- RENDER ----------
function renderAll() {
  renderHeader();
  renderCategories();
  renderTableWithFilters();
  renderSummary();
  renderCategoryChart();
}

function renderHeader() {
  const total = Number(state.totalBudget) || 0;
  const spent = state.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const remaining = total - spent;

  $(".total-budget").textContent = formatMoney(total);
  $(".spent-amount").textContent = formatMoney(spent);

  const remEl = $(".remaining-amount");
  if (remaining < 0) {
    remEl.textContent = "- " + formatMoney(Math.abs(remaining));
    remEl.classList.add("negative");
  } else {
    remEl.textContent = formatMoney(remaining);
    remEl.classList.remove("negative");
  }
}

function renderCategories() {
  Object.keys(state.categoryLimits).forEach(cat => {
    const limit = state.categoryLimits[cat] || 0;
    const spent = state.expenses.filter(x=>x.category===cat).reduce((s,x)=>s+x.amount,0);
    const percent = limit ? Math.min(100, Math.round((spent/limit)*100)) : 0;
    const el = document.querySelector(`[data-category="${cat}"]`);
    if (!el) return;
    const fill = el.querySelector(".progress-fill");
    fill.style.width = percent + "%";
    if (spent > limit) fill.style.background = "linear-gradient(90deg, #f72585, #f8961e)"; else fill.style.background = "";
    const amt = el.querySelector(".category-amount");
    amt.textContent = `${(spent/1e6).toFixed(1)} / ${(limit/1e6).toFixed(1)}tr`;
  });
}

function renderTableWithFilters() {
  const catFilter = $("#category-filter").value;
  const monthFilter = $("#month-filter").value;
  let list = state.expenses.slice();

  if (catFilter && catFilter !== "all") list = list.filter(x => x.category === catFilter);
  if (monthFilter) list = list.filter(x => x.date && x.date.slice(0,7) === monthFilter);

  renderTable(list);
}

function renderTable(list = state.expenses) {
  const tbody = $("#expenseBody");
  const cardContainer = $("#expenseCards");
  
  tbody.innerHTML = "";
  cardContainer.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Chưa có chi phí</td></tr>`;
    cardContainer.innerHTML = `
        <div class="no-expenses">
            <i class="fas fa-receipt"></i>
            <p>Chưa có chi phí nào</p>
            <button class="btn-add-expense" onclick="openExpenseModal()">
                <i class="fas fa-plus"></i> Thêm mới
            </button>
        </div>
    `;
    return;
  }

  // Render Table (Desktop)
  list.forEach(e => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${e.date}</td>
      <td><span class="expense-category category-${e.category}">${labelOf(e.category)}</span></td>
      <td>${escapeHtml(e.desc)}${e.notes ? `<div class="small-note">${escapeHtml(e.notes)}</div>` : ""}</td>
      <td class="expense-amount">${formatMoney(e.amount)}</td>
      <td class="expense-actions">
        <button class="btn-action btn-edit" onclick="editExpense('${e.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-action btn-delete" onclick="removeExpense('${e.id}')"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Render Cards (Mobile)
  list.forEach(e => {
      const card = document.createElement("div");
      card.className = "expense-card";
      card.innerHTML = `
        <div class="expense-card-header">
            <div class="expense-card-title">${escapeHtml(e.desc)}</div>
            <span class="expense-card-category category-${e.category}">${labelOf(e.category)}</span>
        </div>
        <div class="expense-card-details">
            <div class="expense-card-detail">
                <span class="detail-label">Ngày:</span>
                <span class="detail-value">${e.date}</span>
            </div>
            <div class="expense-card-detail">
                <span class="detail-label">Số tiền:</span>
                <span class="detail-value" style="color: var(--primary); font-size: 1.1rem;">${formatMoney(e.amount)}</span>
            </div>
            ${e.notes ? `
            <div class="expense-card-detail">
                <span class="detail-label">Ghi chú:</span>
                <span class="detail-value">${escapeHtml(e.notes)}</span>
            </div>` : ""}
        </div>
        <div class="expense-card-actions">
            <button class="btn-action btn-edit" onclick="editExpense('${e.id}')">
                <i class="fas fa-pen"></i> Sửa
            </button>
            <button class="btn-action btn-delete" onclick="removeExpense('${e.id}')">
                <i class="fas fa-trash"></i> Xóa
            </button>
        </div>
      `;
      cardContainer.appendChild(card);
  });
}

function renderSummary() {
  const spent = state.expenses.reduce((s,e) => s + Number(e.amount), 0);
  $(".summary-total").textContent = formatMoney(spent);
  $(".summary-count").textContent = state.expenses.length;
  $(".summary-average").textContent = state.expenses.length
    ? formatMoney(Math.round(spent / state.expenses.length))
    : "0 ₫";
}

// helpers
function labelOf(key){
  return key === "construction" ? "Phần thô" :
         key === "interior" ? "Nội thất" :
         key === "garden" ? "Sân vườn" :
         key === "other" ? "Phát sinh" : key;
}

function escapeHtml(str){
  if(!str) return "";
  return String(str).replace(/[&<>"']/g, function(m){ return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]; });
}

// ---------- INITIALIZE ----------
document.addEventListener("DOMContentLoaded", () => {
  fetchData();
});

// Chart
function getCategoryTotals() {
  const totals = {
    construction: 0,
    interior: 0,
    garden: 0,
    other: 0
  };

  state.expenses.forEach(e => {
    if (totals[e.category] !== undefined) {
        totals[e.category] += Number(e.amount);
    }
  });

  return totals;
}

function renderCategoryChart() {
  const ctx = document.getElementById("categoryChart");
  if (!ctx) return;

  const data = getCategoryTotals();

  if (categoryChart) categoryChart.destroy();

  categoryChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Phần thô", "Nội thất", "Sân vườn", "Phát sinh"],
      datasets: [{
        data: [
          data.construction,
          data.interior,
          data.garden,
          data.other
        ],
        backgroundColor: [
          "#4361ee",
          "#4cc9f0",
          "#38b000",
          "#f72585"
        ],
        borderWidth: 2,
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 15,
            font: { size: 13 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const value = ctx.raw || 0;
              return `${ctx.label}: ${formatMoney(value)}`;
            }
          }
        }
      },
      cutout: "65%"
    }
  });
}

function togglePanel() {
  const panel = document.querySelector(".left-panel");
  const overlay = document.querySelector(".menu-overlay");
  
  panel.classList.toggle("active");
  
  if (overlay) {
      if (panel.classList.contains("active")) {
          overlay.classList.add("active");
      } else {
          overlay.classList.remove("active");
      }
  }
}
