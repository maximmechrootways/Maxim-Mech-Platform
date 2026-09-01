export type DhaTaskLibraryEntry = {
  hazards: string[]
  controls: string[]
  riskBeforeControls: 'Low' | 'Medium' | 'High' | 'Critical'
  riskAfterControls: 'Low' | 'Medium' | 'High' | 'Critical'
}

export const DHA_TASK_LIBRARY: Record<string, DhaTaskLibraryEntry> = {
  'CONCRETE FORMING & POURING': {
    hazards: ['Manual handling strain', 'Silica dust exposure', 'Wet concrete skin burns', 'Trips over formwork'],
    controls: ['Mechanical lift aids', 'Wet cutting/dust suppression', 'Chemical-resistant gloves and sleeves', 'Clear walkways and housekeeping'],
    riskBeforeControls: 'High',
    riskAfterControls: 'Medium',
  },
  'CONFINED SPACE': {
    hazards: ['Oxygen deficiency', 'Toxic atmosphere', 'Engulfment', 'Restricted rescue access'],
    controls: ['Confined space permit in place', 'Atmospheric testing and continuous monitoring', 'Attendant and communication plan', 'Rescue plan and retrieval equipment'],
    riskBeforeControls: 'Critical',
    riskAfterControls: 'High',
  },
  'CRANE USE HOISTING AND RIGGING': {
    hazards: ['Suspended load strike', 'Rigging failure', 'Pinch points', 'Powerline contact'],
    controls: ['Qualified operator and rigger', 'Pre-lift plan and exclusion zone', 'Inspect slings/shackles before use', 'Maintain powerline clearances and spotter'],
    riskBeforeControls: 'High',
    riskAfterControls: 'Medium',
  },
  DEMOLITION: {
    hazards: ['Uncontrolled collapse', 'Falling debris', 'Hidden services', 'Dust and noise exposure'],
    controls: ['Demolition sequence plan', 'Barricades and debris zones', 'Service isolation and verification', 'Water suppression and hearing protection'],
    riskBeforeControls: 'High',
    riskAfterControls: 'Medium',
  },
  'DRYWALL INSTALLATION/FINISHING': {
    hazards: ['Repetitive strain', 'Work at heights', 'Dust inhalation', 'Cuts from tools'],
    controls: ['Task rotation and proper lifting', 'Approved ladder/platform use', 'Dust extraction and masks', 'Blade guards and safe cutting practices'],
    riskBeforeControls: 'Medium',
    riskAfterControls: 'Low',
  },
  'ELECTRICAL WORK': {
    hazards: ['Electric shock', 'Arc flash', 'Unexpected energization', 'Damaged cords/tools'],
    controls: ['Lock-out/tag-out verification', 'Arc-rated PPE where required', 'Insulated tools and testing before touch', 'Cord and GFCI inspections'],
    riskBeforeControls: 'Critical',
    riskAfterControls: 'Medium',
  },
  'EQUIPMENT/TOOL USE': {
    hazards: ['Kickback or tool failure', 'Flying particles', 'Noise and vibration', 'Entanglement'],
    controls: ['Pre-use inspection checklist', 'Correct guards fitted', 'Eye/hearing protection', 'Operator training and SOP compliance'],
    riskBeforeControls: 'High',
    riskAfterControls: 'Medium',
  },
  'EXCAVATION & TRENCHING': {
    hazards: ['Trench collapse', 'Underground utility strike', 'Water ingress', 'Mobile equipment edge collapse'],
    controls: ['Shoring/sloping/benching', 'Utility locates verified', 'Ladder egress every 7.5 m', 'Spoil pile setback and barricades'],
    riskBeforeControls: 'Critical',
    riskAfterControls: 'High',
  },
  'FLOORING INSTALLATION': {
    hazards: ['Knee and back strain', 'Adhesive fumes', 'Cuts from knives', 'Slip hazards'],
    controls: ['Ergonomic kneeling supports', 'Ventilation and product SDS review', 'Cut-resistant gloves', 'Immediate cleanup of residues'],
    riskBeforeControls: 'Medium',
    riskAfterControls: 'Low',
  },
  'HARDWARE INSTALLATION': {
    hazards: ['Pinch points', 'Hand injuries', 'Dropped objects', 'Improper fastening failure'],
    controls: ['Use proper hand tools', 'Gloves and eye protection', 'Tool tethering at height', 'Torque/fastener spec verification'],
    riskBeforeControls: 'Medium',
    riskAfterControls: 'Low',
  },
  'HAZARDOUS ENERGY CONTROL (LOTO)': {
    hazards: ['Unexpected startup', 'Stored energy release', 'Multiple worker lock conflict', 'Incomplete isolation'],
    controls: ['Documented LOTO procedure', 'Zero-energy verification', 'Personal locks and tags per worker', 'Group lock box process where applicable'],
    riskBeforeControls: 'Critical',
    riskAfterControls: 'Medium',
  },
  'HOT-WORK': {
    hazards: ['Fire ignition', 'Burn injury', 'Welding fumes', 'Explosive atmosphere'],
    controls: ['Hot work permit approved', 'Fire watch and extinguishers present', 'Remove/cover combustibles', 'Ventilation and respiratory protection'],
    riskBeforeControls: 'Critical',
    riskAfterControls: 'High',
  },
  HOUSEKEEPING: {
    hazards: ['Slip/trip hazards', 'Blocked emergency routes', 'Poor visibility of hazards', 'Material stacking collapse'],
    controls: ['Scheduled cleanup intervals', 'Maintain clear access/egress', 'Waste bins and disposal plan', 'Safe stacking limits enforced'],
    riskBeforeControls: 'Medium',
    riskAfterControls: 'Low',
  },
  'HVAC WORK': {
    hazards: ['Sharp edges', 'Work at heights', 'Manual handling strain', 'Exposure to refrigerants'],
    controls: ['Cut-resistant gloves', 'Fall protection and ladder safety', 'Team lifts/mechanical assistance', 'Leak check and ventilation'],
    riskBeforeControls: 'High',
    riskAfterControls: 'Medium',
  },
  'MANUAL MATERIAL STORAGE & HANDLING': {
    hazards: ['Overexertion injury', 'Dropped loads', 'Struck-by during movement', 'Poor storage stability'],
    controls: ['Lift planning and weight limits', 'Use carts/dollies where possible', 'Designated travel paths', 'Racking and storage inspections'],
    riskBeforeControls: 'High',
    riskAfterControls: 'Medium',
  },
  PAINTING: {
    hazards: ['VOC inhalation', 'Skin/eye irritation', 'Flammable vapors', 'Falls from access equipment'],
    controls: ['Ventilation and respirator selection', 'Chemical-resistant PPE', 'No ignition sources in area', 'Scaffold/ladder inspection'],
    riskBeforeControls: 'High',
    riskAfterControls: 'Medium',
  },
  'PLUMBING WORK': {
    hazards: ['Hot work exposure', 'Water damage/slip risk', 'Confined access', 'Tool-related cuts'],
    controls: ['Permit and isolation checks', 'Drain/containment setup', 'Access plan and ventilation', 'Proper PPE and tool inspection'],
    riskBeforeControls: 'High',
    riskAfterControls: 'Medium',
  },
  'SPRINKLER WORK': {
    hazards: ['Pressurized line release', 'Overhead dropped objects', 'Work at height', 'Manual handling of pipe'],
    controls: ['Depressurize and isolate lines', 'Exclusion zone below work', 'Approved elevated work platform', 'Pipe handling aids/team lifts'],
    riskBeforeControls: 'High',
    riskAfterControls: 'Medium',
  },
  'TRUCK LOADING & UNLOADING': {
    hazards: ['Struck-by moving vehicle', 'Load shift/fall', 'Pinch points at tailgate', 'Slip/trip at dock'],
    controls: ['Spotter and signaling protocol', 'Secure loads before movement', 'Wheel chocks and parking brake', 'Dock/yard housekeeping'],
    riskBeforeControls: 'High',
    riskAfterControls: 'Medium',
  },
  'WORK PLATFORM USE (LADDER/SCAFFOLD)': {
    hazards: ['Falls from height', 'Platform instability', 'Overreach', 'Dropped tools'],
    controls: ['Pre-use ladder/scaffold inspection', 'Three-point contact / proper setup', 'Do not overreach; reposition platform', 'Toe boards and tool lanyards'],
    riskBeforeControls: 'High',
    riskAfterControls: 'Medium',
  },
  'WORKING AT HEIGHTS': {
    hazards: ['Fall to lower level', 'Anchor point failure', 'Swing fall', 'Dropped object injuries'],
    controls: ['Fall arrest system inspected', 'Certified anchor points', 'Rescue plan reviewed', 'Barricade drop zones and hard hats'],
    riskBeforeControls: 'Critical',
    riskAfterControls: 'High',
  },
}

export function getDhaTaskLibraryEntry(task: string): DhaTaskLibraryEntry | null {
  return DHA_TASK_LIBRARY[task] ?? null
}
