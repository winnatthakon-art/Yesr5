// ==========================================
// 🎨 DYNAMIC THEME SYSTEM (ระบบสีอัจฉริยะ โหลดไว)
// ==========================================
async function loadAndApplyTheme() {
    // 1. ดึงสีจาก Local Storage มาใช้ทันทีก่อน (0 วินาที ระบบไม่ช้า)
    const cachedColor = localStorage.getItem('appThemeColor');
    if (cachedColor) {
        applyTheme(cachedColor);
    }

    // 2. ยิง API แบบ Background เพื่อเช็คว่าแอดมินเปลี่ยนสีใหม่ไหม
    try {
        const res = await fetch(CONFIG.WEB_APP_API, {
            method: 'POST',
            body: JSON.stringify({ action: 'getTheme' })
        });
        const data = await res.json();

        if (data.color && data.color !== cachedColor) {
            // ถ้าสีใหม่ไม่ตรงกับของเดิม ให้บันทึกทับแล้วเปลี่ยนสีหน้าเว็บทันที
            localStorage.setItem('appThemeColor', data.color);
            applyTheme(data.color);
        }
    } catch (error) {
        console.log("เช็คอัปเดตสีล้มเหลว ใช้สีเดิมต่อไป");
    }
}

// ฟังก์ชันเขียน CSS ทับ Tailwind Class หลัก (medical-700)
function applyTheme(hexColor) {
    if (!hexColor || hexColor === '') return;

    let styleTag = document.getElementById('dynamic-theme');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-theme';
        document.head.appendChild(styleTag);
    }

    // บังคับเปลี่ยนสีจุดสำคัญๆ ที่ใช้คลาส medical-700
    styleTag.innerHTML = `
        .bg-medical-700 { background-color: ${hexColor} !important; }
        .text-medical-700 { color: ${hexColor} !important; }
        .border-medical-700 { border-color: ${hexColor} !important; }
        .focus\\:border-medical-500:focus { border-color: ${hexColor} !important; }
        .hover\\:bg-medical-800:hover { filter: brightness(0.9); background-color: ${hexColor} !important; }
        .bg-medical-50 { background-color: ${hexColor}15 !important; } /* ความโปร่งใส 15% */
        .text-medical-600 { color: ${hexColor} !important; }
    `;
}


// ==========================================
// 🧑‍💼 MEMBER MANAGEMENT SYSTEM
// ==========================================

const rowsPerPage = 10;
let currentPage = 1;
let tableData = [];
let filteredData = [];

// 🌟 รูประบบพื้นฐาน (กันโดนเครือข่ายโรงพยาบาลบล็อก)
const DEFAULT_AVATAR = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/No-Image-Placeholder.svg/330px-No-Image-Placeholder.svg.png";

// ฟังก์ชันเปิด/ปิด Loading ที่ปุ่ม
function setButtonState(buttonElement, isLoading, originalText, loadingText) {
    if (!buttonElement) return;
    if (isLoading) {
        buttonElement.dataset.originalText = originalText;
        buttonElement.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> ${loadingText}`;
        buttonElement.disabled = true;
        buttonElement.classList.add('opacity-75', 'cursor-not-allowed');
    } else {
        buttonElement.innerHTML = buttonElement.dataset.originalText || originalText;
        buttonElement.disabled = false;
        buttonElement.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}

// ==========================================
// 📡 FETCH DATA
// ==========================================
async function fetchData() {
    const tableBody = document.querySelector("#data-table tbody");
    tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-16 text-slate-400"><div class="animate-spin rounded-full h-8 w-8 border-4 border-medical-200 border-t-medical-600 mx-auto mb-3"></div><div class="font-medium text-base">กำลังโหลดข้อมูล...</div></td></tr>`;

    try {
        const response = await fetch(CONFIG.WEB_APP_API, {
            method: 'POST',
            body: JSON.stringify({ action: 'fetchData', source: 'member' })
        });

        if (!response.ok) throw new Error('HTTP error');

        const data = await response.json();
        if (Array.isArray(data)) {
            tableData = data.slice(1); // ตัด Header ออก
            applyFilters();
        } else {
            throw new Error('Data is not an array');
        }
    } catch (error) {
        console.error("Fetch Data Error:", error);
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-16 text-rose-500 font-bold"><i class="fas fa-exclamation-circle text-3xl mb-3 block"></i>ไม่สามารถโหลดข้อมูลได้</td></tr>`;
    }
}

// ==========================================
// 🗂️ DISPLAY & PAGINATION
// ==========================================
function renderTable() {
    const tableBody = document.querySelector("#data-table tbody");
    tableBody.innerHTML = "";

    const startIndex = (currentPage - 1) * rowsPerPage;
    const pageData = filteredData.slice(startIndex, startIndex + rowsPerPage);

    if (pageData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-16 text-slate-500 font-medium">ไม่พบข้อมูลนิสิตแพทย์</td></tr>`;
        document.getElementById('rowsInfo').textContent = 'ไม่พบข้อมูล';
        return;
    }

    const fragment = document.createDocumentFragment(); // 🌟 อัปเกรดความเร็ว

    pageData.forEach((row) => {
        const id = row[0] || "-";
        const name = row[2] || "ไม่ระบุชื่อ";
        const empCode = row[3] || "-";
        const dept = row[4] || "-";

        let imgUrl = row[5];
        if (!imgUrl || String(imgUrl).trim() === "" || !String(imgUrl).startsWith("http")) {
            imgUrl = DEFAULT_AVATAR;
        }

        const expectedIn = row[7] || "-";
        const expectedOut = row[12] || "-";
        const leaveTotal = (parseInt(row[8]) || 0) + (parseInt(row[9]) || 0) + (parseInt(row[10]) || 0);
        const ot = row[11] || 0;

        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50 transition border-b border-slate-50/50";

        tr.innerHTML = `
            <td class="py-4 px-5 text-center font-bold text-slate-500">${id}</td>
            <td class="py-4 px-5">
                <div class="flex items-center gap-4">
                    <img src="${imgUrl}" class="h-12 w-12 object-cover rounded-full border border-slate-200 shadow-sm bg-white">
                    <div>
                        <div class="font-bold text-slate-800 text-base">${name}</div>
                        <div class="text-xs text-slate-500 font-medium mt-0.5">รหัส: <span class="text-slate-700">${empCode}</span></div>
                        <div class="text-[10px] text-slate-400 mt-1.5 flex gap-1.5 flex-wrap">
                            <span class="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200"><i class="far fa-clock"></i> ${expectedIn}-${expectedOut}</span>
                            <span class="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">ลารวม ${leaveTotal} วัน</span>
                            <span class="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">OT ${ot} ชม.</span>
                        </div>
                    </div>
                </div>
            </td>
            <td class="py-4 px-5 text-center">
                <span class="inline-block px-3 py-1 text-xs rounded-lg font-bold bg-medical-50 text-medical-700 border border-medical-100">${dept}</span>
            </td>
            <td class="py-4 px-5 text-center">
                <div class="flex justify-center gap-2">
                    <button class="edit-btn bg-medical-50 text-medical-600 border border-medical-200 py-1.5 px-3 rounded-lg hover:bg-medical-100 hover:text-medical-800 transition font-bold text-xs shadow-sm"><i class="fas fa-edit mr-1"></i> แก้ไข</button>
                    <button class="delete-btn bg-rose-50 text-rose-600 border border-rose-200 py-1.5 px-3 rounded-lg hover:bg-rose-100 hover:text-rose-800 transition font-bold text-xs shadow-sm"><i class="fas fa-trash-alt mr-1"></i> ลบ</button>
                </div>
            </td>
        `;

        tr.querySelector('.edit-btn').onclick = () => openEditModal(row);
        tr.querySelector('.delete-btn').onclick = (e) => confirmDelete(id, e.target);
        fragment.appendChild(tr);
    });

    document.querySelector("#data-table tbody").appendChild(fragment); // เทข้อมูลลงรวดเดียว
    setupPagination();
}

function setupPagination() {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
    const pagination = document.getElementById("pagination");
    pagination.innerHTML = "";

    document.getElementById("rowsInfo").textContent = `หน้า ${currentPage} / ${totalPages} (รวม ${filteredData.length} รายการ)`;

    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        btn.className = `h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold transition focus:outline-none `;

        if (i === currentPage) {
            btn.classList.add("bg-medical-700", "text-white", "shadow-sm");
        } else {
            btn.classList.add("bg-white", "text-slate-600", "border", "border-slate-200", "hover:bg-medical-50", "hover:text-medical-700");
        }

        btn.onclick = () => { currentPage = i; renderTable(); window.scrollTo(0, 0); };
        pagination.appendChild(btn);
    }
}

// ==========================================
// ✏️ EDIT & MODAL
// ==========================================
const modal = document.getElementById("edit-modal");
const modalContent = document.getElementById("edit-modal-content");

function openEditModal(row) {
    document.getElementById("edit-id").value = row[0] || "";
    document.getElementById("edit-userID").value = row[1] || "";
    document.getElementById("edit-name").value = row[2] || "";
    document.getElementById("edit-employeeID").value = row[3] || "";
    document.getElementById("edit-department").value = row[4] || "";

    // 🌟 แก้ไขบัครูปภาพใน Modal
    let imgUrl = row[5];
    if (!imgUrl || String(imgUrl).trim() === "" || !String(imgUrl).startsWith("http")) {
        imgUrl = DEFAULT_AVATAR;
    }
    document.getElementById("edit-imageUrl").value = row[5] || "";
    document.getElementById("preview-image").src = imgUrl;

    document.getElementById("edit-workStart").value = row[7] || "";
    document.getElementById("edit-vacationLeave").value = row[8] || "0";
    document.getElementById("edit-personalLeave").value = row[9] || "0";
    document.getElementById("edit-sickLeave").value = row[10] || "0";
    document.getElementById("edit-ot").value = row[11] || "0";
    document.getElementById("edit-workEnd").value = row[12] || "";

    document.getElementById("edit-image").value = "";

    modal.classList.remove("hidden");
    setTimeout(() => {
        modal.classList.remove("opacity-0");
        modalContent.classList.remove("scale-95");
    }, 10);
}

function closeEditModal() {
    modal.classList.add("opacity-0");
    modalContent.classList.add("scale-95");
    setTimeout(() => { modal.classList.add("hidden"); }, 300);
}

document.getElementById("edit-image").addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => document.getElementById('preview-image').src = e.target.result;
        reader.readAsDataURL(file);
    }
});

// ==========================================
// 💾 SAVE, DELETE & RESET
// ==========================================
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

document.getElementById("edit-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    const imageFile = document.getElementById("edit-image").files[0];
    let imageData = document.getElementById("edit-imageUrl").value;
    let isNewImage = false;

    if (imageFile) {
        try {
            imageData = await getBase64(imageFile);
            isNewImage = true;
        } catch (error) { return Swal.fire("เกิดข้อผิดพลาด", "การแปลงรูปภาพล้มเหลว", "error"); }
    }

    const saveBtn = document.getElementById("save-button");
    const originalHtml = saveBtn.innerHTML;
    setButtonState(saveBtn, true, originalHtml, "กำลังบันทึก...");

    const formData = new URLSearchParams();
    formData.append('method', 'updateData');
    formData.append('id', document.getElementById("edit-id").value);
    formData.append('userID', document.getElementById("edit-userID").value);
    formData.append('name', document.getElementById("edit-name").value);
    formData.append('employeeID', document.getElementById("edit-employeeID").value);
    formData.append('department', document.getElementById("edit-department").value);
    formData.append('imageUrl', imageData);
    formData.append('isNewImage', isNewImage.toString());
    formData.append('vacationLeave', document.getElementById("edit-vacationLeave").value);
    formData.append('personalLeave', document.getElementById("edit-personalLeave").value);
    formData.append('sickLeave', document.getElementById("edit-sickLeave").value);
    formData.append('ot', document.getElementById("edit-ot").value);
    formData.append('workStart', document.getElementById("edit-workStart").value);
    formData.append('workEnd', document.getElementById("edit-workEnd").value);

    try {
        await fetch(CONFIG.WEB_APP_API, { method: "POST", body: formData });
        Swal.fire("สำเร็จ!", "อัปเดตข้อมูลเรียบร้อยแล้ว", "success");
        await fetchData();
        closeEditModal();
    } catch (error) {
        Swal.fire("ข้อผิดพลาด!", `อัปเดตล้มเหลว: ${error.message}`, "error");
    } finally {
        setButtonState(saveBtn, false, originalHtml, "");
    }
});

async function deleteData(id, btnElement) {
    const originalHtml = btnElement.innerHTML;
    setButtonState(btnElement, true, originalHtml, "ลบ...");

    try {
        const formData = new URLSearchParams();
        formData.append('method', 'deleteData');
        formData.append('id', id);

        await fetch(CONFIG.WEB_APP_API, { method: "POST", body: formData });
        Swal.fire("ลบเรียบร้อย", "ลบข้อมูลนิสิตแพทย์สำเร็จ", "success");
        await fetchData();
    } catch (error) {
        Swal.fire("ข้อผิดพลาด!", `การลบข้อมูลล้มเหลว: ${error.message}`, "error");
        setButtonState(btnElement, false, originalHtml, "");
    }
}

function confirmDelete(id, btnElement) {
    Swal.fire({
        title: "ยืนยันการลบ",
        text: `ต้องการลบข้อมูล ID: ${id} หรือไม่?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#e11d48",
        cancelButtonColor: "#94a3b8",
        confirmButtonText: "ลบเลย",
        cancelButtonText: "ยกเลิก"
    }).then((result) => {
        if (result.isConfirmed) deleteData(id, btnElement);
    });
}

async function handleReset(methodName, btnId, btnText, titleText) {
    const btn = document.getElementById(btnId);
    const originalHtml = btn.innerHTML;

    Swal.fire({
        title: "ยืนยันการรีเซ็ต",
        text: `ต้องการล้าง${titleText}ทั้งหมดเป็น 0 หรือไม่?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#0f766e",
        cancelButtonColor: "#94a3b8",
        confirmButtonText: "รีเซ็ตเลย",
        cancelButtonText: "ยกเลิก"
    }).then(async (result) => {
        if (result.isConfirmed) {
            setButtonState(btn, true, originalHtml, "กำลังรีเซ็ต...");
            try {
                const formData = new URLSearchParams();
                formData.append('method', methodName);
                await fetch(CONFIG.WEB_APP_API, { method: "POST", body: formData });
                Swal.fire("สำเร็จ!", `ล้าง${titleText}เรียบร้อยแล้ว`, "success");
                fetchData();
            } catch (error) { Swal.fire("ข้อผิดพลาด", "ไม่สามารถรีเซ็ตได้", "error"); }
            finally { setButtonState(btn, false, originalHtml, ""); }
        }
    });
}

document.getElementById("reset-leaves").addEventListener("click", () => handleReset('resetLeaves', 'reset-leaves', 'ล้างวันลา', 'ค่าวันลา'));
document.getElementById("reset-ot").addEventListener("click", () => handleReset('resetOT', 'reset-ot', 'ล้าง OT', 'ค่า OT'));

// ==========================================
// 🔍 FILTER (การค้นหาและกรองชั้นปี)
// ==========================================
function applyFilters() {
    const searchVal = document.getElementById("filter-search").value.toLowerCase().trim();
    const yearVal = document.getElementById("filter-year").value.trim();

    filteredData = tableData.filter((row) => {
        // 🌟 แก้ไขบัค toLowerCase: ครอบด้วย String() ป้องกันข้อมูลเป็น Number
        const name = String(row[2] || "").toLowerCase();
        const empId = String(row[3] || "").toLowerCase();
        const dept = String(row[4] || "");

        if (searchVal && !name.includes(searchVal) && !empId.includes(searchVal)) return false;
        if (yearVal && dept !== yearVal) return false;

        return true;
    });

    currentPage = 1;
    renderTable();
}

document.getElementById("filter-search").addEventListener("input", applyFilters);
document.getElementById("filter-year").addEventListener("change", applyFilters);


// ==========================================
// 🔒 ADMIN AUTHENTICATION (อัปเกรดดึงรหัสจาก Sheet)
// ==========================================
function checkAdminAuth(callback) {
    if (sessionStorage.getItem('adminAuth') === 'true') {
        if (callback) callback();
        return;
    }
    Swal.fire({
        title: '🔒 เข้าสู่ระบบผู้ดูแล',
        input: 'password',
        inputPlaceholder: 'กรอกรหัสผ่าน',
        allowOutsideClick: false,
        allowEscapeKey: false,
        confirmButtonText: 'เข้าสู่ระบบ',
        confirmButtonColor: '#0f766e',
        showLoaderOnConfirm: true, // แสดงสถานะโหลดตอนกำลังตรวจรหัส
        preConfirm: async (password) => {
            try {
                // 🌟 ยิง API ไปเช็ครหัสผ่านกับ Google Sheet
                const response = await fetch(CONFIG.WEB_APP_API, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'verifyPassword', password: password })
                });
                const result = await response.json();

                if (!result.success) {
                    Swal.showValidationMessage('รหัสผ่านไม่ถูกต้อง!');
                    return false;
                }
                return true;
            } catch (error) {
                Swal.showValidationMessage('การเชื่อมต่อล้มเหลว โปรดลองอีกครั้ง');
                return false;
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            sessionStorage.setItem('adminAuth', 'true');
            if (callback) callback();
        }
    });
}

// ==========================================
// 📡 FETCH ROLES TO FILTER (ดึงข้อมูลตำแหน่งจาก Google Sheet)
// ==========================================
async function loadRolesToFilter() {
    try {
        const res = await fetch(CONFIG.WEB_APP_API, {
            method: 'POST',
            body: JSON.stringify({ action: 'getRoles' })
        });
        const roles = await res.json();

        const filterYear = document.getElementById('filter-year');
        filterYear.innerHTML = '<option value="">ทุกตำแหน่ง / ชั้นปี</option>'; // เคลียร์และใส่ค่าตั้งต้น

        roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role.name;
            option.textContent = role.name;
            // หากต้องการให้โชว์กลุ่มด้วย สามารถแก้เป็น: option.textContent = `${role.name} (${role.group})`;
            filterYear.appendChild(option);
        });

    } catch (error) {
        console.error("Error loading roles:", error);
    }
}

// โหลดข้อมูลเมื่อเปิดหน้า (ผ่านการตรวจสอบรหัส)
window.onload = () => {
    checkAdminAuth(async () => {
        await loadRolesToFilter(); // โหลดตัวเลือกตำแหน่งให้เสร็จก่อน
        await fetchData();         // แล้วค่อยโหลดตารางข้อมูลสมาชิก
    });

    // 🚀 เรียกใช้งานทันที
    loadAndApplyTheme();
};