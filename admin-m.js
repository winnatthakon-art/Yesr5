// ==========================================
// 📱 MOBILE ADMIN DASHBOARD SYSTEM
// ==========================================

const DEFAULT_AVATAR = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/No-Image-Placeholder.svg/330px-No-Image-Placeholder.svg.png";
let fullData = [];
let membersData = [];
let currentFilter = 'all';

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

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth(() => {
        fetchDataAndDisplay();
        document.getElementById('searchInput').addEventListener('input', renderCards);
        document.getElementById('filterDate').addEventListener('change', renderCards); // 🌟 ฟังเหตุการณ์กรองวันที่
    });
});

// ==========================================
// 📡 FETCH DATA
// ==========================================
async function fetchDataAndDisplay() {
    const listEl = document.getElementById('dataList');
    listEl.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-slate-400"><div class="animate-spin rounded-full h-10 w-10 border-4 border-medical-200 border-t-medical-600 mb-4"></div><p class="text-base font-bold">กำลังโหลดข้อมูล...</p></div>`;

    try {
        const [checkinRes, memberRes] = await Promise.all([
            fetch(CONFIG.WEB_APP_API, { method: 'POST', body: JSON.stringify({ action: 'fetchData' }) }),
            fetch(CONFIG.WEB_APP_API, { method: 'POST', body: JSON.stringify({ action: 'fetchData', source: 'member' }) })
        ]);

        const rawData = await checkinRes.json();
        const rawMembers = await memberRes.json();

        if (!Array.isArray(rawData) || rawData.length <= 1) {
            listEl.innerHTML = '<div class="text-center text-slate-400 mt-12"><i class="fas fa-box-open text-5xl mb-3 block"></i><p class="text-lg font-bold">ไม่พบประวัติ</p></div>';
            return;
        }

        fullData = rawData.slice(1).reverse();
        membersData = Array.isArray(rawMembers) ? rawMembers.slice(1) : [];

        renderCards();
    } catch (error) {
        console.error("Error fetching data:", error);
        listEl.innerHTML = `<div class="text-center text-rose-500 mt-12 font-bold"><i class="fas fa-exclamation-circle text-5xl mb-3 block"></i><p class="text-lg">โหลดข้อมูลล้มเหลว</p></div>`;
    }
}

// ==========================================
// 📅 DATE FORMATTER 
// ==========================================
function formatThai(dateStr, timeStr) {
    try {
        let day, month, year;
        const safeDateStr = String(dateStr).trim();
        const safeTimeStr = String(timeStr).trim();

        if (safeDateStr.includes("T")) {
            const d = new Date(safeDateStr);
            day = d.getDate(); month = d.getMonth(); year = d.getFullYear();
        } else if (safeDateStr.includes("/")) {
            const parts = safeDateStr.split('/');
            if (parts.length === 3) { day = parseInt(parts[0], 10); month = parseInt(parts[1], 10) - 1; year = parseInt(parts[2], 10); }
            else { return { d: safeDateStr, t: safeTimeStr }; }
        } else { return { d: safeDateStr, t: safeTimeStr }; }

        let tFmt = "-";
        if (safeTimeStr.includes("T")) {
            const t = new Date(safeTimeStr);
            tFmt = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} น.`;
        } else if (safeTimeStr && safeTimeStr !== "undefined" && safeTimeStr !== "-") {
            tFmt = safeTimeStr.replace(" น.", "").trim() + " น.";
        }

        if (year < 2500) year += 543;
        const mTh = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
        return { d: `${day} ${mTh[month]} ${year}`, t: tFmt };
    } catch (e) { return { d: String(dateStr), t: String(timeStr) }; }
}

// ==========================================
// 🔍 FILTERS & RENDER CARDS
// ==========================================
function setFilter(type, btnElement) {
    currentFilter = type;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.className = "tab-btn px-5 py-2 rounded-full text-sm font-bold bg-slate-100 text-slate-500 whitespace-nowrap";
    });
    btnElement.className = "tab-btn px-5 py-2 rounded-full text-sm font-bold bg-medical-600 text-white whitespace-nowrap shadow-sm";
    renderCards();
}

// ==========================================
// 🔍 FILTERS & RENDER CARDS (อัปเกรดความเร็ว + รองรับบุคลากรทุกระดับ)
// ==========================================
function renderCards() {
    const listEl = document.getElementById('dataList');
    listEl.innerHTML = '';
    const searchVal = document.getElementById('searchInput').value.toLowerCase();
    const filterDate = document.getElementById('filterDate').value; // ค่าจะเป็นรูปแบบ YYYY-MM-DD

    let count = 0;

    // 🌟 ใช้ DocumentFragment เพื่อความเร็วขั้นสุด
    const fragment = document.createDocumentFragment();

    fullData.forEach((item) => {
        const name = String(item[2] || '').toLowerCase();
        const empId = String(item[3] || '').toLowerCase();
        const status = item[4] || '';
        const statusDetail = item[12] || 'ปกติ';

        // 1. กรองคำค้นหา
        if (searchVal && !name.includes(searchVal) && !empId.includes(searchVal)) return;

        // 2. กรองแท็บ
        if (currentFilter !== 'all') {
            if (currentFilter === 'late') {
                if (statusDetail !== 'สาย' && statusDetail !== 'ออกก่อนเวลา') return;
            } else if (status !== currentFilter) return;
        }

        // 3. กรองวันที่
        if (filterDate) {
            let itemDateStr = "";
            const safeDateStr = String(item[6]).trim();
            if (safeDateStr.includes("T")) {
                itemDateStr = safeDateStr.split('T')[0]; // ตัดเอาแค่ YYYY-MM-DD
            } else if (safeDateStr.includes("/")) {
                const parts = safeDateStr.split('/'); // DD/MM/YYYY
                if (parts.length === 3) {
                    const d = parts[0].padStart(2, '0');
                    const m = parts[1].padStart(2, '0');
                    const y = parts[2];
                    itemDateStr = `${y}-${m}-${d}`;
                }
            }
            if (itemDateStr !== filterDate) return; // ถ้าระบุวันที่แล้วไม่ตรง ให้ข้ามเลย
        }

        count++;

        // หาข้อมูลสมาชิก
        const userId = item[11];
        const member = membersData.find(m => m[1] === userId);

        // 🌟 ดึงข้อมูลตำแหน่ง (ลบคำว่า "ปี" ออก เพื่อให้แสดง "แพทย์ใช้ทุน" หรือ "นพท. ปี 6" ได้ตรงๆ)
        const dept = member ? member[4] : '-';

        let profileImg = DEFAULT_AVATAR;
        if (member && member[5] && String(member[5]).startsWith("http")) profileImg = member[5];

        item._memberData = member;
        item._profileImg = profileImg;

        let checkinImg = item[1];
        if (!checkinImg || !String(checkinImg).startsWith("http")) checkinImg = DEFAULT_AVATAR;

        const f = formatThai(item[6], item[7]);
        const minutes = item[13] || '';

        // จัดป้ายสถานะ
        let badgeClass = "bg-slate-100 text-slate-600";
        if (status === 'เข้าเวร') badgeClass = "bg-medical-50 text-medical-600 border border-medical-100";
        if (status === 'ออกเวร') badgeClass = "bg-rose-50 text-rose-600 border border-rose-100";
        if (status === 'ราว ward') badgeClass = "bg-amber-50 text-amber-600 border border-amber-100";

        // จัดป้ายความล่าช้า
        let lateHtml = '';
        if (statusDetail === 'สาย') {
            lateHtml = `<span class="bg-rose-50 text-rose-600 text-[10px] font-bold px-1.5 py-0.5 rounded ml-2 shadow-sm">+${minutes} น.</span>`;
        } else if (statusDetail === 'ออกก่อนเวลา') {
            lateHtml = `<span class="bg-orange-50 text-orange-600 text-[10px] font-bold px-1.5 py-0.5 rounded ml-2 shadow-sm">-${minutes} น.</span>`;
        }

        // สร้าง Card
        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-4 flex items-center gap-4 active:bg-slate-50 transition cursor-pointer";
        card.onclick = () => openModal(item);

        card.innerHTML = `
            <div class="relative flex-shrink-0">
                <img src="${checkinImg}" class="w-14 h-14 rounded-full object-cover border border-slate-200 shadow-sm">
                <img src="${profileImg}" class="w-6 h-6 rounded-full object-cover border-2 border-white absolute -bottom-1 -right-1 shadow-md">
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start">
                    <h3 class="font-bold text-base text-slate-800 truncate pr-2">${item[2]}</h3>
                    <div class="text-xs font-bold text-medical-600 flex-shrink-0 mt-0.5">${f.t}</div>
                </div>
                <div class="text-xs text-slate-500 font-medium mt-1">รหัส: ${item[3]} <span class="ml-1 px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">${dept}</span></div>
                <div class="flex items-center mt-2">
                    <span class="px-2.5 py-0.5 rounded text-[11px] font-bold ${badgeClass}">${status}</span>
                    ${lateHtml}
                </div>
            </div>
        `;

        // 🌟 นำการ์ดไปใส่ตะกร้า (Fragment) ก่อน
        fragment.appendChild(card);
    });

    // 🌟 เทข้อมูลจากตะกร้าลงหน้าจอทีเดียว
    listEl.appendChild(fragment);

    if (count === 0) {
        listEl.innerHTML = '<div class="text-center text-slate-400 mt-12"><i class="fas fa-search text-5xl mb-3 block"></i><p class="text-lg font-bold">ไม่พบข้อมูลที่ค้นหา</p></div>';
    }
}

// ==========================================
// 🖼️ BOTTOM SHEET MODAL (ดูรายละเอียด)
// ==========================================
function openModal(item) {
    const f = formatThai(item[6], item[7]);

    document.getElementById('m-checkinImg').src = item[1] && String(item[1]).startsWith("http") ? item[1] : DEFAULT_AVATAR;
    document.getElementById('m-profileImg').src = item._profileImg;

    document.getElementById('m-name').textContent = item[2] || '-';
    document.getElementById('m-id').textContent = `รหัส: ${item[3] || '-'} | ${item._memberData ? item._memberData[4] : '-'}`;

    const status = item[4] || '-';
    const statusEl = document.getElementById('m-status');
    statusEl.textContent = status;
    if (status === 'เข้าเวร') statusEl.className = "font-bold text-medical-700";
    else if (status === 'ออกเวร') statusEl.className = "font-bold text-rose-600";
    else statusEl.className = "font-bold text-amber-600";

    document.getElementById('m-date').textContent = f.d;
    document.getElementById('m-time').textContent = f.t;

    const statusDetail = item[12] || 'ปกติ';
    const minutes = item[13] || '';
    let delayHtml = "-";
    if (statusDetail === 'สาย') {
        delayHtml = `<span class="text-rose-600 font-bold bg-rose-50 px-3 py-1.5 rounded-lg text-sm">+${minutes} นาที</span>`;
    } else if (statusDetail === 'ออกก่อนเวลา') {
        delayHtml = `<span class="text-orange-600 font-bold bg-orange-50 px-3 py-1.5 rounded-lg text-sm">-${minutes} นาที</span>`;
    } else if (statusDetail === 'ตรงเวลา') {
        delayHtml = `<span class="text-emerald-600 font-bold text-sm"><i class="fas fa-check-circle mr-1"></i> ตรงเวลา</span>`;
    }
    document.getElementById('m-delay').innerHTML = delayHtml;

    document.getElementById('m-location').textContent = item[8] || 'ไม่มีข้อมูลสถานที่';
    document.getElementById('m-note').textContent = item[5] && item[5] !== '-' ? item[5] : '-';

    document.getElementById('modalOverlay').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('modalOverlay').classList.remove('opacity-0');
        document.getElementById('detailModal').classList.add('open');
    }, 10);
}

function closeModal() {
    document.getElementById('modalOverlay').classList.add('opacity-0');
    document.getElementById('detailModal').classList.remove('open');
    setTimeout(() => {
        document.getElementById('modalOverlay').classList.add('hidden');
    }, 300);
}