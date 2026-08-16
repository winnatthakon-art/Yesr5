// ==========================================
// 🏥 MEDICAL TIME ATTENDANCE SYSTEM (SPA)
// ==========================================

const DEFAULT_AVATAR = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/No-Image-Placeholder.svg/330px-No-Image-Placeholder.svg.png";

let TARGET_LOCATIONS = [{
    id: 'default',
    name: 'จุดเริ่มต้น',
    lat: CONFIG.TARGET_LATITUDE,
    lng: CONFIG.TARGET_LONGITUDE,
    range: CONFIG.ALLOWED_RANGE_METERS
}];

let currentUserData = null;
let currentUserId = null;
let timeSettingsData = [];

let stream;
let currentFacingMode = "user";
let activeCameraMode = null;
let isMirrored = true;

let watchId = null;
let cachedLocation = null;

let leafletMap = null;
let userMarker = null;

// ==========================================
// 🎨 0. DYNAMIC THEME SYSTEM 
// ==========================================
loadAndApplyTheme();

function loadAndApplyTheme() {
    const cachedColor = localStorage.getItem('appThemeColor');
    if (cachedColor) applyTheme(cachedColor);

    fetch(CONFIG.WEB_APP_API, {
        method: 'POST',
        body: JSON.stringify({ action: 'getTheme' })
    })
        .then(res => res.text())
        .then(text => {
            try {
                const data = JSON.parse(text);
                if (data.color) {
                    let newColor = data.color.trim();
                    if (!newColor.startsWith('#')) newColor = '#' + newColor;

                    if (newColor !== cachedColor) {
                        localStorage.setItem('appThemeColor', newColor);
                        applyTheme(newColor);
                    }
                }
            } catch (e) { console.error("Theme Fetch Error:", e); }
        })
        .catch(error => console.error("Theme Fetch Error:", error));
}

function applyTheme(hexColor) {
    if (!hexColor || hexColor === '') return;

    let styleTag = document.getElementById('dynamic-theme');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-theme';
        document.body.appendChild(styleTag);
    }

    styleTag.innerHTML = `
        .bg-medical-700, .bg-medical-600, .bg-medical-800 { background-color: ${hexColor} !important; }
        .text-medical-700, .text-medical-600 { color: ${hexColor} !important; }
        .text-medical-100 { color: #f1f5f9 !important; } 
        .border-medical-700, .border-medical-500, .border-medical-200 { border-color: ${hexColor} !important; }
        .focus\\:border-medical-500:focus { border-color: ${hexColor} !important; }
        .focus\\:ring-medical-500:focus { --tw-ring-color: ${hexColor} !important; }
        .from-medical-600 { --tw-gradient-from: ${hexColor} !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important; }
        .to-medical-700 { --tw-gradient-to: ${hexColor} !important; }
        .bg-medical-50 { background-color: ${hexColor}1A !important; } 
        input[type="radio"]:checked + label {
            background-color: ${hexColor} !important;
            color: white !important;
            border-color: ${hexColor} !important;
            box-shadow: 0 4px 6px -1px ${hexColor}40 !important;
        }
    `;
}

// ==========================================
// 🚀 1. SYSTEM INITIALIZATION
// ==========================================
function updateLoading(percent, mainText, subText) {
    const progressEl = document.getElementById('loadingProgress');
    const mainTextEl = document.getElementById('loadingText');
    const subTextEl = document.getElementById('loadingSubText');

    if (progressEl) progressEl.style.width = `${percent}%`;
    if (mainTextEl && mainText) mainTextEl.textContent = mainText;
    if (subTextEl && subText) subTextEl.textContent = subText;
}

function showLoadingError(message) {
    document.getElementById('loadingContent').classList.add('hidden');
    const errorBox = document.getElementById('loadingError');
    errorBox.classList.remove('hidden');
    errorBox.classList.add('flex');
    document.getElementById('loadingErrorText').textContent = message;
}

window.onload = async function () {
    startClock();
    try {
        updateLoading(20, 'กำลังเชื่อมต่อ...', 'ตรวจสอบบัญชีผู้ใช้ LINE');
        await liff.init({ liffId: CONFIG.LIFF_ID_CHECKIN });

        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            currentUserId = profile.userId;
            const lineIdInput = document.getElementById('reg-lineId');
            if (lineIdInput) lineIdInput.value = currentUserId;

            updateLoading(40, 'ตรวจสอบประวัติ...', 'ค้นหาข้อมูลส่วนตัวของคุณ');
            await checkUserStatus(currentUserId);
        } else {
            liff.login();
        }
    } catch (error) {
        console.error("Initialization Error:", error);
        showLoadingError("ไม่สามารถเชื่อมต่อ LINE ได้ กรุณาลองใหม่");
    }
};

async function checkUserStatus(userId) {
    const response = await fetch(CONFIG.WEB_APP_API, {
        method: "POST",
        body: JSON.stringify({ action: "fetchData", source: "member", userId: userId }),
    });

    if (!response.ok) throw new Error("ไม่สามารถติดต่อฐานข้อมูลได้");

    const data = await response.json();
    const userRows = data.filter((row) => row[1] === userId);

    if (userRows.length > 0) {
        userRows.sort((a, b) => new Date(b[6]) - new Date(a[6]));
        currentUserData = userRows[0];

        updateLoading(70, 'เตรียมหน้าจอ...', 'โหลดแผนที่และหมวดเวลา');
        await Promise.all([
            fetchMapSettings().catch(e => console.warn(e)),
            fetchTimeSettings().catch(e => console.warn(e))
        ]);

        updateLoading(100, 'เสร็จสิ้น!', 'เข้าสู่ระบบลงเวลา');
        switchView('checkinView');
        setTimeout(() => { setupCheckinView(); }, 600);
    } else {
        updateLoading(80, 'ข้อมูลใหม่...', 'โหลดข้อมูลชั้นปีและตำแหน่ง');
        await fetchRolesSettings().catch(e => console.warn(e));

        updateLoading(100, 'เสร็จสิ้น!', 'เข้าสู่หน้าลงทะเบียน');
        switchView('registerView');
        setTimeout(() => { setupRegisterView(); }, 600);
    }
}

function startClock() {
    setInterval(() => {
        const now = new Date();
        document.getElementById('headerDate').textContent = now.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
        document.getElementById('headerTime').textContent = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
    }, 1000);
}

function buildRoleOptions(roles, deptSelect) {
    deptSelect.innerHTML = '<option value="" disabled selected>-- เลือกตำแหน่ง / ชั้นปี --</option>';
    if (Array.isArray(roles)) {
        roles.forEach(role => {
            let roleName = "";
            if (typeof role === 'string') roleName = role;
            else if (Array.isArray(role)) roleName = role[0];
            else if (role && role.name) roleName = role.name;

            if (roleName && roleName !== "undefined") {
                const option = document.createElement('option');
                option.value = roleName.trim();
                option.textContent = roleName.trim();
                deptSelect.appendChild(option);
            }
        });
    }
}

// 🌟 แก้ไขไม่ให้ Cache จำข้อมูลที่เป็นค่าว่าง
async function fetchRolesSettings() {
    const deptSelect = document.getElementById('reg-dept');
    if (!deptSelect) return;

    const cached = sessionStorage.getItem('cache_roles');
    if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) {
            buildRoleOptions(parsed, deptSelect);
            return;
        }
    }

    try {
        const res = await fetch(CONFIG.WEB_APP_API, { method: 'POST', redirect: 'follow', body: JSON.stringify({ action: 'getRoles' }) });
        const roles = await res.json();
        if (Array.isArray(roles) && roles.length > 0) {
            sessionStorage.setItem('cache_roles', JSON.stringify(roles)); 
        }
        buildRoleOptions(roles, deptSelect);
    } catch (error) {
        deptSelect.innerHTML = '<option value="" disabled selected>-- ❌ โหลดข้อมูลตำแหน่งล้มเหลว --</option>';
        throw error;
    }
}

async function fetchMapSettings() {
    const cached = sessionStorage.getItem('cache_maps');
    if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) {
            TARGET_LOCATIONS = parsed;
            return;
        }
    }

    const res = await fetch(CONFIG.WEB_APP_API, { method: 'POST', redirect: 'follow', body: JSON.stringify({ action: 'getSettings' }) });
    const data = await res.json();

    if (Array.isArray(data) && data.length > 0) {
        TARGET_LOCATIONS = data;
        sessionStorage.setItem('cache_maps', JSON.stringify(TARGET_LOCATIONS));
    } else if (data && data.lat) {
        TARGET_LOCATIONS = [{ id: 'old', name: 'จุดหลัก', lat: parseFloat(data.lat), lng: parseFloat(data.lng), range: parseInt(data.range) }];
        sessionStorage.setItem('cache_maps', JSON.stringify(TARGET_LOCATIONS));
    }
}

async function fetchTimeSettings() {
    const cached = sessionStorage.getItem('cache_times');
    if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) {
            timeSettingsData = parsed;
            return;
        }
    }

    const res = await fetch(CONFIG.WEB_APP_API, { method: 'POST', redirect: 'follow', body: JSON.stringify({ action: 'getTimeSettings' }) });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
        timeSettingsData = data;
        sessionStorage.setItem('cache_times', JSON.stringify(timeSettingsData));
    } else {
        timeSettingsData = data || []; 
    }
}

function switchView(viewId) {
    document.getElementById('loadingView').classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('registerView').classList.add('hidden');
    document.getElementById('checkinView').classList.add('hidden');

    setTimeout(() => {
        document.getElementById('loadingView').classList.add('hidden');
        document.getElementById(viewId).classList.remove('hidden');
        document.getElementById(viewId).classList.add('flex');
    }, 400);
}

// ==========================================
// 📸 2. CAMERA 
// ==========================================
async function startCamera(mode) {
    activeCameraMode = mode;
    const videoEl = document.getElementById(`${mode}-camera-preview`);
    if (!videoEl) return;

    if (stream) { stream.getTracks().forEach(track => track.stop()); stream = null; }

    isMirrored = (currentFacingMode === "user");
    applyMirrorEffect(mode);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        Swal.fire("ข้อผิดพลาด", "บราวเซอร์ของคุณไม่รองรับการเปิดกล้อง", "error");
        return;
    }

    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode }, audio: false });
        videoEl.srcObject = stream;
        videoEl.setAttribute("playsinline", "true");
        videoEl.play();
        videoEl.style.display = "block";
        const previewEl = document.getElementById(`${mode}-preview`);
        if (previewEl) previewEl.classList.add('hidden');
    } catch (err) {
        console.warn("First camera attempt failed, trying fallback...", err);
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            videoEl.srcObject = stream;
            videoEl.setAttribute("playsinline", "true");
            videoEl.play();
            videoEl.style.display = "block";
            const previewEl = document.getElementById(`${mode}-preview`);
            if (previewEl) previewEl.classList.add('hidden');
        } catch (fallbackErr) {
            console.error("Camera failed:", fallbackErr);
            Swal.fire({ icon: "warning", title: "เข้าถึงกล้องไม่ได้", text: "กรุณาไปที่การตั้งค่ามือถือ -> อนุญาตให้ LINE เข้าถึงกล้อง", confirmButtonColor: localStorage.getItem('appThemeColor') || "#0f766e" });
        }
    }
}

function switchCamera(mode) {
    currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
    startCamera(mode);
}

function toggleMirror(mode) {
    isMirrored = !isMirrored;
    applyMirrorEffect(mode);
}

function applyMirrorEffect(mode) {
    const videoEl = document.getElementById(`${mode}-camera-preview`);
    const previewEl = document.getElementById(`${mode}-preview`);
    const transformStyle = isMirrored ? "scaleX(-1)" : "scaleX(1)";
    if (videoEl) videoEl.style.transform = transformStyle;
    if (previewEl) previewEl.style.transform = transformStyle;
}

function captureOptimizedFrame(mode) {
    const video = document.getElementById(`${mode}-camera-preview`);
    if (!video || !video.videoWidth) throw new Error("ไม่พบภาพจากกล้อง");

    const canvas = document.createElement("canvas");
    const scale = 600 / video.videoWidth;
    canvas.width = 600;
    canvas.height = video.videoHeight * scale;

    const ctx = canvas.getContext("2d");
    if (isMirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
}

// ==========================================
// 📝 3. REGISTRATION
// ==========================================
let capturedRegImage = null;

async function setupRegisterView() {
    await startCamera('reg'); 

    const captureBtn = document.getElementById('reg-capture-btn');
    const retakeBtn = document.getElementById('reg-retake-btn');
    const previewImg = document.getElementById('reg-preview');
    const videoEl = document.getElementById('reg-camera-preview');

    captureBtn.onclick = () => {
        try {
            capturedRegImage = captureOptimizedFrame('reg');
            previewImg.src = capturedRegImage;
            previewImg.classList.remove('hidden');
            if (videoEl) videoEl.style.display = 'none';

            captureBtn.classList.add('hidden');
            retakeBtn.classList.remove('hidden');
            if (stream) { stream.getTracks().forEach(track => track.stop()); stream = null; }
        } catch (e) {
            Swal.fire("ข้อผิดพลาด", "ไม่สามารถถ่ายภาพได้ โปรดรอกล้องเปิดขึ้นมาก่อน", "error");
        }
    };

    retakeBtn.onclick = () => {
        capturedRegImage = null;
        previewImg.classList.add('hidden');
        captureBtn.classList.remove('hidden');
        retakeBtn.classList.add('hidden');
        startCamera('reg');
    };

    document.getElementById('btn-register').onclick = submitRegistration;
}

function submitRegistration() {
    const name = document.getElementById('reg-name').value.trim();
    const empId = document.getElementById('reg-empId').value.trim();
    const dept = document.getElementById('reg-dept').value.trim();

    if (!name || !empId || !dept) return Swal.fire("ข้อมูลไม่ครบ", "กรุณากรอกฟิลด์ที่มีดอกจันให้ครบ", "warning");
    if (!capturedRegImage) return Swal.fire("ข้อมูลไม่ครบ", "กรุณาถ่ายรูปโปรไฟล์จากกล้อง", "warning");

    Swal.fire({ title: 'กำลังลงทะเบียน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const obj = {
        base64: capturedRegImage.split(",")[1],
        nameId: name,
        keynumberId: empId,
        keynumber2Id: dept,
        userlineId: currentUserId
    };

    fetch(CONFIG.WEB_APP_API, { method: "POST", body: JSON.stringify(obj) })
        .then(() => {
            Swal.fire({ title: "สำเร็จ!", text: "ลงทะเบียนเรียบร้อยแล้ว", icon: "success", confirmButtonColor: localStorage.getItem('appThemeColor') || "#0f766e" })
                .then(() => {
                    currentUserData = ["", currentUserId, name, empId, dept, capturedRegImage];
                    switchView('checkinView');
                    setTimeout(() => { setupCheckinView(); }, 500);
                });
        }).catch(() => Swal.fire("ข้อผิดพลาด", "ไม่สามารถส่งข้อมูลได้", "error"));
}

// ==========================================
// 📍 4. SMART GPS & CHECK-IN LOGIC
// ==========================================
async function setupCheckinView() {
    document.getElementById('chk-name').textContent = currentUserData[2];
    document.getElementById('chk-details').textContent = `รหัส: ${currentUserData[3]} | ${currentUserData[4]}`;

    const profileImageUrl = currentUserData[5];
    if (profileImageUrl && profileImageUrl.startsWith('http') && !profileImageUrl.includes('placeholder.com')) {
        document.getElementById('chk-profile-img').src = profileImageUrl;
    } else {
        document.getElementById('chk-profile-img').src = DEFAULT_AVATAR;
    }

    // 🌟 ถ้าระบบยังไม่มีข้อมูลแผนที่หรือเวลา (กรณีคนเพิ่งสมัครใหม่) ให้ดึงข้อมูลก่อนเปิดหน้า
    if (timeSettingsData.length === 0 || TARGET_LOCATIONS.length === 0 || TARGET_LOCATIONS[0].id === 'default') {
        Swal.fire({ title: 'กำลังเตรียมข้อมูลลงเวลา...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        await Promise.all([
            fetchMapSettings().catch(e => console.warn(e)),
            fetchTimeSettings().catch(e => console.warn(e))
        ]);
        Swal.close();
    }

    populateJobDropdown();

    await startCamera('chk');
    startBackgroundGPS();

    document.getElementById('btn-checkin').onclick = processOneClickCheckin;
}

function populateJobDropdown() {
    const jobSelect = document.getElementById('chk-job');
    if (!jobSelect) return;

    jobSelect.innerHTML = '<option value="" disabled selected>-- เลือกประเภทการลงเวลา --</option>';
    const userRole = currentUserData[4] || "";

    let availableJobs = timeSettingsData.filter(t =>
        t.role === userRole || t.role === '?' || !t.role.trim()
    );

    if (availableJobs.length === 0) availableJobs = timeSettingsData;

    const uniqueJobs = new Set();
    availableJobs.forEach(item => {
        if (item.job && !uniqueJobs.has(item.job)) {
            uniqueJobs.add(item.job);
            const option = document.createElement('option');
            option.value = item.job;
            option.textContent = item.job;
            jobSelect.appendChild(option);
        }
    });

    if (jobSelect.options.length > 1) {
        jobSelect.selectedIndex = 1;
    }
}

function updateGpsIndicatorColor(state) {
    const btn = document.querySelector('[onclick="openMapModal()"]');
    if (!btn) return;

    const dot = btn.querySelector('.rounded-full.animate-pulse');
    const icon = btn.querySelector('.fa-map-marker-alt');

    if (dot && icon) {
        const dotColor = state === 'in_range' ? 'bg-emerald-400' : state === 'out_range' ? 'bg-rose-500' : 'bg-amber-400';
        const iconColor = state === 'in_range' ? 'text-emerald-400' : state === 'out_range' ? 'text-rose-500' : 'text-amber-400';

        dot.className = `w-2 h-2 rounded-full animate-pulse ${dotColor}`;
        icon.className = `fas fa-map-marker-alt mr-1 ${iconColor}`;
    }
}

function startBackgroundGPS() {
    updateGpsIndicatorColor('searching');

    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                cachedLocation = pos.coords;
                let inRange = false;
                for (const loc of TARGET_LOCATIONS) {
                    if (calculateDistance(pos.coords.latitude, pos.coords.longitude, loc.lat, loc.lng) <= loc.range) {
                        inRange = true; break;
                    }
                }
                updateGpsIndicatorColor(inRange ? 'in_range' : 'out_range');
            },
            (err) => {
                console.warn("GPS Pre-fetch failed", err);
                updateGpsIndicatorColor('searching');
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
    }
}

function getSmartGPSLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("บราวเซอร์ไม่รองรับ GPS"));

        let isResolved = false;

        const masterTimeout = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                reject(new Error("หมดเวลาค้นหาพิกัด กรุณาตรวจสอบสัญญาณเน็ตหรือเปิด GPS บนมือถือ"));
            }
        }, 15000);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (isResolved) return;
                isResolved = true;
                clearTimeout(masterTimeout);
                resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            (err) => {
                if (isResolved) return;
                console.warn("GPS ดาวเทียมหาไม่เจอ สลับไปใช้สัญญาณเน็ต/Wi-Fi", err);

                navigator.geolocation.getCurrentPosition(
                    (posFallback) => {
                        if (isResolved) return;
                        isResolved = true;
                        clearTimeout(masterTimeout);
                        resolve({ lat: posFallback.coords.latitude, lng: posFallback.coords.longitude });
                    },
                    (errFallback) => {
                        if (isResolved) return;
                        isResolved = true;
                        clearTimeout(masterTimeout);
                        let errMsg = "ไม่สามารถระบุตำแหน่งได้";
                        if (errFallback.code === 1) errMsg = "กรุณาไปที่ตั้งค่ามือถือ -> อนุญาตให้ LINE เข้าถึง 'ตำแหน่ง (Location)'";
                        if (errFallback.code === 2) errMsg = "อยู่ในมุมอับสัญญาณ ลองเชื่อมต่อ Wi-Fi หรือออกมาที่โล่ง";
                        if (errFallback.code === 3) errMsg = "หมดเวลาการค้นหาพิกัด";
                        reject(new Error(errMsg));
                    },
                    { enableHighAccuracy: false, timeout: 7000, maximumAge: 60000 }
                );
            },
            { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
        );
    });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function processOneClickCheckin() {
    try {
        const jobSelect = document.getElementById('chk-job');
        if (!jobSelect || !jobSelect.value) {
            return Swal.fire("แจ้งเตือน", "กรุณาเลือกประเภทการลงเวลาก่อนครับ", "warning");
        }

        Swal.fire({ title: 'กำลังตรวจสอบพิกัด...', text: 'อาจใช้เวลาสักครู่หากอยู่ในอาคาร', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        let lat, lng;
        if (cachedLocation) {
            lat = cachedLocation.latitude;
            lng = cachedLocation.longitude;
        } else {
            const coords = await getSmartGPSLocation();
            lat = coords.lat;
            lng = coords.lng;
            cachedLocation = { latitude: lat, longitude: lng };
        }

        Swal.fire({ title: 'กำลังบันทึกข้อมูล...', text: 'กำลังอัปโหลดรูปภาพและข้อมูล', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        await executeCheckin(lat, lng);

    } catch (error) {
        Swal.fire({ icon: "error", title: "แจ้งเตือนพิกัด", text: error.message, confirmButtonColor: localStorage.getItem('appThemeColor') || "#0f766e" });
    }
}

async function executeCheckin(lat, lng) {
    let inRange = false;
    let nearestDistance = Infinity;
    let targetLocationName = "ไม่ทราบสถานที่";

    for (const loc of TARGET_LOCATIONS) {
        const distance = calculateDistance(lat, lng, loc.lat, loc.lng);
        if (distance < nearestDistance) nearestDistance = distance;

        if (distance <= loc.range) {
            inRange = true;
            targetLocationName = loc.name;
            break; 
        }
    }

    if (!inRange) {
        return Swal.fire({ icon: "error", title: "อยู่นอกพื้นที่!", text: `คุณอยู่ห่างจากจุดลงเวลาที่ใกล้ที่สุด ${nearestDistance.toFixed(0)} เมตร`, confirmButtonColor: localStorage.getItem('appThemeColor') || "#0f766e" });
    }

    try {
        const jobSelect = document.getElementById('chk-job');
        if (!jobSelect || !jobSelect.value) {
            return Swal.fire("แจ้งเตือน", "กรุณาเลือกประเภทการลงเวลาก่อนครับ", "warning");
        }

        Swal.update({
            title: 'กำลังบันทึกข้อมูลปฏิบัติงาน...',
            html: 'กำลังส่งข้อมูลเข้าฐานข้อมูล กรุณารอสักครู่'
        });

        if (targetLocationName.includes("นอกสถานที่") || targetLocationName.includes("อิสระ")) {
            try {
                Swal.update({ html: 'กำลังดึงชื่อตำแหน่งสถานที่จริง...' });
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                const data = await res.json();
                if (data && data.display_name) {
                    targetLocationName = `นอกสถานที่: ${data.display_name}`;
                }
            } catch (e) {
                targetLocationName = `นอกสถานที่ (พิกัด: ${lat.toFixed(5)}, ${lng.toFixed(5)})`;
            }
        }

        const capturedImageBase64 = captureOptimizedFrame('chk').split(",")[1];
        const jobType = jobSelect.value;
        const note = document.getElementById('chk-note').value;
        const now = new Date();

        const payload = {
            base64: capturedImageBase64,
            name: currentUserData[2],
            role: currentUserData[4],
            job: jobType,
            note: note,
            today: `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
            time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
            lat: lat,
            long: lng,
            address: targetLocationName, 
            user: currentUserId
        };

        const response = await fetch(CONFIG.WEB_APP_API, { method: "POST", body: JSON.stringify(payload) });
        if (!response.ok) throw new Error("เครือข่ายขัดข้อง ไม่สามารถเชื่อมต่อฐานข้อมูลได้");

        sessionStorage.removeItem('cache_times');

        Swal.fire("สำเร็จ!", "บันทึกเวลาเรียบร้อยแล้ว", "success").then(() => sendFlexMessage(payload));

    } catch (e) {
        Swal.fire("ข้อผิดพลาด", e.message || "กรุณาถ่ายภาพก่อนลงเวลา (ไม่พบกล้อง)", "warning");
    }
}

// ==========================================
// 🗺️ 5. MAP MODAL (LEAFLET) 
// ==========================================
async function openMapModal() {
    document.getElementById('mapModal').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('mapModal').classList.remove('opacity-0');
        document.getElementById('mapModalContent').classList.remove('translate-y-full');
    }, 10);

    try {
        Swal.fire({ title: 'กำลังค้นหาพิกัด...', text: 'อาจใช้เวลาสักครู่หากอยู่ในอาคาร', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        let lat, lng;
        if (cachedLocation) {
            lat = cachedLocation.latitude;
            lng = cachedLocation.longitude;
        } else {
            const coords = await getSmartGPSLocation();
            lat = coords.lat;
            lng = coords.lng;
            cachedLocation = { latitude: lat, longitude: lng };
        }

        Swal.close();

        let nearestDistance = Infinity;
        let nearestRange = 30;

        for (const loc of TARGET_LOCATIONS) {
            const dist = calculateDistance(lat, lng, loc.lat, loc.lng);
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestRange = loc.range;
            }
        }

        let distText = nearestDistance <= nearestRange
            ? `<span class="text-emerald-600">อยู่ในระยะ (${nearestDistance.toFixed(0)} ม.)</span>`
            : `<span class="text-rose-600">อยู่นอกระยะ (${nearestDistance.toFixed(0)} ม.)</span>`;
        document.getElementById('mapDistanceText').innerHTML = `ระยะห่างจากจุดใกล้สุด: ${distText}`;

        initOrUpdateMap(lat, lng);

    } catch (error) {
        Swal.fire({ icon: "error", title: "แจ้งเตือน", text: error.message, confirmButtonColor: localStorage.getItem('appThemeColor') || "#0f766e" });
    }
}

function initOrUpdateMap(userLat, userLng) {
    if (!leafletMap) {
        leafletMap = L.map('map').setView([TARGET_LOCATIONS[0].lat, TARGET_LOCATIONS[0].lng], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(leafletMap);

        TARGET_LOCATIONS.forEach(loc => {
            const themeColor = localStorage.getItem('appThemeColor') || '#0f766e';
            L.circle([loc.lat, loc.lng], {
                color: themeColor,
                fillColor: themeColor,
                fillOpacity: 0.2,
                radius: loc.range
            }).addTo(leafletMap);

            L.marker([loc.lat, loc.lng]).addTo(leafletMap)
                .bindPopup(`<b>${loc.name}</b>`);
        });
    }

    const customIcon = L.divIcon({ className: 'pulsing-dot', iconSize: [14, 14], iconAnchor: [7, 7] });

    if (userMarker) leafletMap.removeLayer(userMarker);
    userMarker = L.marker([userLat, userLng], { icon: customIcon }).addTo(leafletMap).bindPopup("ตำแหน่งของคุณ");

    const bounds = L.latLngBounds([[TARGET_LOCATIONS[0].lat, TARGET_LOCATIONS[0].lng], [userLat, userLng]]);
    leafletMap.fitBounds(bounds, { padding: [30, 30] });

    setTimeout(() => leafletMap.invalidateSize(), 300);
}

function closeMapModal() {
    document.getElementById('mapModal').classList.add('opacity-0');
    document.getElementById('mapModalContent').classList.add('translate-y-full');
    setTimeout(() => document.getElementById('mapModal').classList.add('hidden'), 300);
}

// ==========================================
// 💬 6. LINE FLEX MESSAGE
// ==========================================
async function sendFlexMessage(data) {
    const jobColor = localStorage.getItem('appThemeColor') || '#0f766e';

    const now = new Date();
    const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const displayThaiDate = `${now.getDate()} ${thaiMonths[now.getMonth()]} ${now.getFullYear() + 543}`;

    const flexMsg = {
        type: "flex", altText: `บันทึก${data.job}`,
        contents: {
            type: "bubble",
            body: {
                type: "box", layout: "vertical", spacing: "md",
                contents: [
                    { type: "box", layout: "horizontal", contents: [{ type: "text", text: "บันทึกเวลาปฏิบัติงาน", weight: "bold", size: "md", color: "#1e293b" }, { type: "text", text: data.job, weight: "bold", size: "md", color: jobColor, align: "end" }] },
                    { type: "separator" },
                    {
                        type: "box", layout: "vertical", spacing: "sm", contents: [
                            {
                                type: "box", layout: "baseline", contents: [
                                    { type: "text", text: "ผู้บันทึก", weight: "bold", size: "sm", color: "#64748b", flex: 2 },
                                    { type: "text", text: `${data.role} ${data.name}`, size: "sm", align: "end", color: "#0f172a", flex: 5, weight: "bold", wrap: true }
                                ]
                            }
                        ]
                    },
                    { type: "separator" },
                    {
                        type: "box", layout: "vertical", contents: [
                            { type: "box", layout: "baseline", contents: [{ type: "text", text: "วันที่", weight: "bold", color: "#64748b", flex: 2 }, { type: "text", text: displayThaiDate, weight: "bold", align: "end", color: "#0f172a", flex: 5 }] },
                            { type: "box", layout: "baseline", contents: [{ type: "text", text: "เวลา", weight: "bold", color: "#64748b", flex: 2 }, { type: "text", text: data.time + " น.", weight: "bold", size: "xl", color: jobColor, align: "end", flex: 5 }] }
                        ]
                    },
                    { type: "separator" },
                    {
                        type: "box", layout: "vertical", spacing: "xs", contents: [
                            { type: "text", text: "สถานที่", weight: "bold", size: "xs", color: "#64748b" },
                            { type: "text", text: data.address || "ตรวจสอบพิกัดสำเร็จ", wrap: true, size: "xs", color: "#475569" }
                        ]
                    }
                ]
            }
        }
    };
    try { await liff.sendMessages([flexMsg]); } catch (e) { console.error(e); }
    liff.closeWindow();
}