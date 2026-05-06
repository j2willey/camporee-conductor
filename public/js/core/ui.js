/**
 * Shared UI Rendering Logic
 * Generates HTML for scoring fields.
 */

export function generateFieldHTML(field, value = null) {
    const id = field.id;
    const isPenalty = field.kind === 'penalty';
    const penaltyStyle = isPenalty ? 'color: #dc3545; font-weight: bold;' : '';
    const labelClass = `field-label small fw-bold mb-0${isPenalty ? ' text-danger' : ''}`;

    // 1. Textarea: full-width vertical stack
    if (field.type === 'textarea') {
        return `<div class="score-field-row score-field-wide px-2 py-1">
            <label class="${labelClass}" for="f_${id}" style="${penaltyStyle}">${field.label}</label>
            <textarea class="form-control form-control-sm mt-1" id="f_${id}" rows="2"
                placeholder="${field.placeholder || ''}" style="${penaltyStyle}"></textarea>
        </div>`;
    }

    // 2. All others: inline label + input
    let input = '';
    let labelContent = `<label class="${labelClass}" for="f_${id}" style="${penaltyStyle}">${field.label}</label>`;

    if (field.type === 'boolean') {
        const checked = value === true ? 'checked' : '';
        input = `<div class="form-check form-switch mb-0 d-flex justify-content-end">
                    <input class="form-check-input" type="checkbox" id="f_${id}" style="transform: scale(1.3);" ${checked}>
                 </div>`;
    } else if (field.type === 'range') {
        const currentVal = value !== null ? value : Math.ceil((field.max || 5) / 2);
        input = `<div class="d-flex align-items-center gap-1">
                <input type="range" class="form-range" id="f_${id}"
                       min="${field.min || 0}" max="${field.max || 5}" value="${currentVal}"
                       oninput="document.getElementById('d_${id}').innerText=this.value">
                <span class="fw-bold" id="d_${id}"
                      style="min-width:1.8em; text-align:right; ${isPenalty ? 'color:#dc3545;' : 'color:var(--bs-primary);'}">
                    ${currentVal}
                </span>
            </div>`;
    } else if (field.type === 'timed' || field.type === 'stopwatch') {
        let mm = '', ss = '';
        if (value && typeof value === 'string' && value.includes(':')) {
            [mm, ss] = value.split(':');
        }
        labelContent = `
            <div class="d-flex justify-content-between align-items-center w-100">
                <label class="${labelClass}" for="f_${id}_mm" style="${penaltyStyle}">${field.label}</label>
                <button type="button" class="btn btn-success btn-sm fw-bold px-2 py-0"
                        style="height:30px; font-size:0.75rem;"
                        onclick="startStopwatch('${id}')">START</button>
            </div>`;
        input = `<div class="input-group input-group-sm">
                <input type="number" class="form-control text-center px-1" id="f_${id}_mm"
                       placeholder="MM" inputmode="numeric" pattern="[0-9]*"
                       onchange="app.combineTime('${id}')" value="${mm}" style="${penaltyStyle}">
                <span class="input-group-text px-1">:</span>
                <input type="number" class="form-control text-center px-1" id="f_${id}_ss"
                       placeholder="SS" inputmode="numeric" pattern="[0-9]*"
                       onchange="app.combineTime('${id}')" value="${ss}" style="${penaltyStyle}">
            </div>
            <input type="hidden" id="f_${id}_val" value="${value || ''}">`;
    } else if (field.type === 'number') {
        input = `<input type="number" class="form-control form-control-sm text-center" id="f_${id}"
                        inputmode="numeric" pattern="[0-9]*"
                        placeholder="${field.placeholder || ''}"
                        value="${value !== null ? value : ''}" style="${penaltyStyle}">`;
    } else if (field.type === 'select') {
        const optionsHtml = (field.options || []).map(o => {
            const selected = (o === value) ? 'selected' : '';
            return `<option value="${o}" ${selected}>${o}</option>`;
        }).join('');
        input = `<select class="form-select form-select-sm" id="f_${id}" style="${penaltyStyle}">
                    ${optionsHtml}
                 </select>`;
    } else {
        input = `<input type="text" class="form-control form-control-sm" id="f_${id}"
                        value="${value || ''}" style="${penaltyStyle}">`;
    }

    return `<div class="score-field-row d-flex align-items-center border-bottom px-2">
                <div class="score-field-label me-2">${labelContent}</div>
                <div class="score-field-input">${input}</div>
            </div>`;
}

/**
 * Updates the header subtitle if the element exists.
 * @param {string} text - The text to display.
 */
export function setSubtitle(text) {
    const subtitle = document.getElementById('header-subtitle');
    if (subtitle) {
        subtitle.innerText = text ? ` - ${text}` : '';
    }
}
