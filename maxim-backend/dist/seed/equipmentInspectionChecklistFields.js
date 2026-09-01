"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEquipmentInspectionChecklistFields = buildEquipmentInspectionChecklistFields;
function buildEquipmentInspectionChecklistFields() {
    return [
        // Header fields
        { type: 'TEXT', label: 'Shop/Site', required: false },
        { type: 'TEXT', label: 'Location/Address', required: false },
        { type: 'TEXT', label: 'Unit #', required: false },
        { type: 'TEXT', label: 'Operator', required: false },
        { type: 'DATE', label: 'Date', required: false },
        { type: 'TEXT', label: 'Hour Metre', required: false },
        { type: 'TEXT', label: 'Shift', required: false },
        // 1) General — cab/visibility/safety items + structural checks (order matches paper form)
        { type: 'TEXT', label: '[SECTION] 1) General', required: false },
        { type: 'CHECKBOX', label: 'Load rating plate', required: false },
        { type: 'CHECKBOX', label: 'Safety warnings and plates', required: false },
        { type: 'CHECKBOX', label: 'Deposits of fluids on the ground', required: false },
        { type: 'CHECKBOX', label: 'Headlights', required: false },
        { type: 'CHECKBOX', label: 'Horn', required: false },
        { type: 'CHECKBOX', label: 'Wipers', required: false },
        { type: 'CHECKBOX', label: 'Seatbelt', required: false },
        { type: 'CHECKBOX', label: 'Backup Alarm', required: false },
        { type: 'CHECKBOX', label: 'Bucket condition and cover', required: false },
        // 2) Tires
        { type: 'TEXT', label: '[SECTION] 2) Tires', required: false },
        { type: 'CHECKBOX', label: 'No bonding failure', required: false },
        { type: 'CHECKBOX', label: 'Proper inflation', required: false },
        { type: 'CHECKBOX', label: 'Sufficient tread (if applicable)', required: false },
        // 3) Operating System
        { type: 'TEXT', label: '[SECTION] 3) Operating System', required: false },
        { type: 'CHECKBOX', label: 'Mast condition', required: false },
        { type: 'CHECKBOX', label: 'Hoses and exhaust', required: false },
        { type: 'CHECKBOX', label: 'Ignition and warning lights', required: false },
        // 4) Fluids & Belts
        { type: 'TEXT', label: '[SECTION] 4) Fluids & Belts', required: false },
        { type: 'CHECKBOX', label: 'Oil', required: false },
        { type: 'CHECKBOX', label: 'Transmission', required: false },
        { type: 'CHECKBOX', label: 'Hydraulic', required: false },
        { type: 'CHECKBOX', label: 'Steering fluid', required: false },
        // 5) Fuel
        { type: 'TEXT', label: '[SECTION] 5) Fuel', required: false },
        { type: 'CHECKBOX', label: 'No leaks of fuel', required: false },
        { type: 'CHECKBOX', label: 'Connections & hoses in good repair', required: false },
        { type: 'CHECKBOX', label: 'Fire extinguisher available', required: false },
        // 6) Steering
        { type: 'TEXT', label: '[SECTION] 6) Steering', required: false },
        { type: 'CHECKBOX', label: 'No excessive play', required: false },
        // 7) Lift System
        { type: 'TEXT', label: '[SECTION] 7) Lift System', required: false },
        { type: 'CHECKBOX', label: 'Tension in chains', required: false },
        { type: 'CHECKBOX', label: 'Hoses (lift)', required: false },
        { type: 'CHECKBOX', label: 'Mast (lift)', required: false },
        // 8) Brakes
        { type: 'TEXT', label: '[SECTION] 8) Brakes', required: false },
        { type: 'CHECKBOX', label: 'Operational brakes', required: false },
        { type: 'CHECKBOX', label: 'Pedal depresses proper distance', required: false },
        { type: 'CHECKBOX', label: 'Deadman brake functioning', required: false },
        // 9) Gauges
        { type: 'TEXT', label: '[SECTION] 9) Gauges', required: false },
        { type: 'CHECKBOX', label: 'Oil gauge', required: false },
        { type: 'CHECKBOX', label: 'Battery charge', required: false },
        { type: 'CHECKBOX', label: 'Hour metre reading', required: false },
        // Signature
        { type: 'TEXT', label: '[SECTION] Operator Sign-off', required: false },
        { type: 'SIGNATURE', label: "Operator's Initials", required: false },
    ];
}
