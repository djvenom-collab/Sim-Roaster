/* ===========================================================================
 * SAMPLE REFERENCE DATA — the master lists you'll edit most often
 * ===========================================================================
 * Fictional, demo-safe data. This is the ONLY dataset the app runs on; it is
 * self-contained with no external source. The five lists below are the raw
 * building blocks everything else is generated from.
 *
 * HOW TO EDIT (each list is just rows — copy a row and tweak it):
 *   samplePositions  — the seats that can be sat. Key fields: code (label
 *                      shown), program ("RADAR"/"TOWER"), validityDays (how
 *                      long currency lasts), active (false hides it).
 *   sampleSimulators — the sim devices. program decides which department.
 *   sampleCourseList — the exercises, written compactly as
 *                      [program, simulatorId, course code, required staff].
 *                      A code ending in " V" is a Validation delivery.
 *   sampleAssignments— the leave/training/roster category codes.
 *   sampleRoster     — the people, written as [full name, 3-letter code, role].
 *
 * IMPORTANT: the "id" fields (e.g. "pos-cod", "sim-rs1") are how records link
 * to each other. If you add a row, give it a new unique id; if you change an
 * id, update everything that points at it.
 * =========================================================================== */
import type { Assignment, Position, Simulator } from "../types"

// ── Positions — every seat that can be sat on a run ───────────────────────
// CHANGEABLE: add/remove rows. validityDays sets how long currency lasts;
// program puts the seat in RADAR or TOWER; active:false hides it from pickers.
export const samplePositions: Position[] = [
  {"id":"pos-cod","code":"COD","name":"Coordinator","description":"Approach coordinator","validityDays":60,"program":"RADAR","group":"Management","category":"Coordinator","airport":"Central TMA","sortOrder":1,"active":true},
  {"id":"pos-arr","code":"ARR","name":"Arrival Radar","description":"Arrival sector radar","validityDays":60,"program":"RADAR","group":"Arrival Sector","category":"Radar","airport":"Central TMA","sortOrder":2,"active":true},
  {"id":"pos-dir","code":"DIR","name":"Director","description":"Arrival sector director","validityDays":60,"program":"RADAR","group":"Arrival Sector","category":"Radar","airport":"Central TMA","sortOrder":3,"active":true},
  {"id":"pos-dpn","code":"DPN","name":"Departure North","description":"Departure sector north","validityDays":60,"program":"RADAR","group":"Departure Sector","category":"Radar","airport":"Central TMA","sortOrder":4,"active":true},
  {"id":"pos-dps","code":"DPS","name":"Departure South","description":"Departure sector south","validityDays":60,"program":"RADAR","group":"Departure Sector","category":"Radar","airport":"Central TMA","sortOrder":5,"active":true},
  {"id":"pos-dsr","code":"SSR","name":"South Sector Radar","description":"South sector radar","validityDays":60,"program":"RADAR","group":"Al Maktoum Sector","category":"Radar","airport":"Central TMA","sortOrder":6,"active":true},
  {"id":"pos-amr","code":"AWR","name":"Approach West Radar","description":"West approach radar","validityDays":60,"program":"RADAR","group":"Al Maktoum Sector","category":"Radar","airport":"Central TMA","sortOrder":7,"active":true},
  {"id":"pos-min","code":"INL","name":"Inland Sector","description":"Inland sector radar","validityDays":60,"program":"RADAR","group":"Al Maktoum Sector","category":"Radar","airport":"Central TMA","sortOrder":8,"active":true},
  {"id":"pos-rgmc","code":"GMC","name":"Ground Movement Coordinator","description":"Ground operations coordinator","validityDays":60,"program":"RADAR","group":"Ground Operations","category":"Support","airport":"Central TMA","sortOrder":9,"active":true},
  {"id":"pos-ossa","code":"OSS-A","name":"Operational Support - Arrival","description":"Arrival operational support","validityDays":60,"program":"RADAR","group":"Support","category":"Support","airport":"Central TMA","sortOrder":10,"active":true},
  {"id":"pos-ossd","code":"OSS-D","name":"Operational Support - Departure","description":"Departure operational support","validityDays":60,"program":"RADAR","group":"Support","category":"Support","airport":"Central TMA","sortOrder":11,"active":true},
  {"id":"pos-tcod","code":"COD","name":"Coordinator","description":"Tower coordinator","validityDays":60,"program":"TOWER","group":"Group 1","category":"Coordinator","simulatorUnit":"Tower Sim 1","airport":"MET","sortOrder":1,"active":true},
  {"id":"pos-gmp","code":"GMP","name":"Ground Movement Planner","description":"Ground movement planning","validityDays":60,"program":"TOWER","group":"Group 2","category":"Ground","simulatorUnit":"Tower Sim 1","airport":"MET","sortOrder":2,"active":true},
  {"id":"pos-gmc1","code":"GMC 1","name":"Ground Movement Controller 1","description":"Ground movement control","validityDays":60,"program":"TOWER","group":"Group 2","category":"Ground","simulatorUnit":"Tower Sim 1","airport":"MET","sortOrder":3,"active":true},
  {"id":"pos-gmc2","code":"GMC 2","name":"Ground Movement Controller 2","description":"Ground movement control","validityDays":60,"program":"TOWER","group":"Group 2","category":"Ground","simulatorUnit":"Tower Sim 1","airport":"MET","sortOrder":4,"active":true},
  {"id":"pos-air-dep","code":"AIR-DEP","name":"Air Departure","description":"Aerodrome departures","validityDays":60,"program":"TOWER","group":"Group 3","category":"Aerodrome","simulatorUnit":"Tower Sim 1","airport":"MET","sortOrder":5,"active":true},
  {"id":"pos-air-arr","code":"AIR-ARR","name":"Air Arrival","description":"Aerodrome arrivals","validityDays":60,"program":"TOWER","group":"Group 4","category":"Aerodrome","simulatorUnit":"Tower Sim 1","airport":"MET","sortOrder":6,"active":true},
  {"id":"pos-gmc","code":"GMC","name":"Ground Movement Controller","description":"Ground movement control","validityDays":60,"program":"TOWER","group":"Group 1","category":"Ground","simulatorUnit":"Tower Sim 2","airport":"MTW","sortOrder":7,"active":true},
  {"id":"pos-air","code":"AIR","name":"Air Controller","description":"Aerodrome air control","validityDays":60,"program":"TOWER","group":"Group 2","category":"Aerodrome","simulatorUnit":"Tower Sim 2","airport":"MTW","sortOrder":8,"active":true},
]

// ── DimSimulators ───────────────────────────────────────────────────────
export const sampleSimulators: Simulator[] = [
  {"id":"sim-rs3","code":"RS3","name":"Radar Sim 3","location":"Sim Hall A","active":true,"program":"RADAR","simulatorType":"Radar","siteAirport":"MTW","coverageArea":"Central TMA","generation":"Legacy","transitionStatus":"Legacy / Transition","replacedBy":"RS1 / RS2","notes":"Legacy radar simulator. Transitioned to RS1 and RS2, but still in use.","sortOrder":1},
  {"id":"sim-rs1","code":"RS1","name":"Radar Sim 1","location":"Training Wing","active":true,"program":"RADAR","simulatorType":"Radar","siteAirport":"MTW","coverageArea":"Central TMA","generation":"Current","transitionStatus":"Current","notes":"Operational radar simulator covering the central TMA.","sortOrder":2},
  {"id":"sim-rs2","code":"RS2","name":"Radar Sim 2","location":"Training Wing","active":true,"program":"RADAR","simulatorType":"Radar","siteAirport":"MTW","coverageArea":"Central TMA","generation":"Current","transitionStatus":"Current","notes":"Operational radar simulator covering the central TMA.","sortOrder":3},
  {"id":"sim-ts1","code":"TS1","name":"Tower Sim 1","location":"Sim Hall A","active":true,"program":"TOWER","simulatorType":"Tower","siteAirport":"MTW","coverageArea":"MET","generation":"Current","transitionStatus":"Current","notes":"Operational tower simulator simulating Metro Intl operations.","sortOrder":4},
  {"id":"sim-ts2","code":"TS2","name":"Tower Sim 2","location":"Sim Hall A","active":true,"program":"TOWER","simulatorType":"Tower","siteAirport":"MTW","coverageArea":"MTW","generation":"Current","transitionStatus":"Current","notes":"Operational tower simulator simulating Metro West operations.","sortOrder":5},
  {"id":"sim-ts3","code":"TS3","name":"Tower Sim 3","location":"Training Wing","active":false,"program":"TOWER","simulatorType":"Tower","siteAirport":"MTW","coverageArea":"TBD","generation":"Future","transitionStatus":"Installation","notes":"Tower simulator currently being installed and not operational yet.","sortOrder":6},
]

// ── DimExercises (course list) ──────────────────────────────────────────
// [program, simulatorId, course code, required staff/resources].
// Courses ending in " V" are validation deliveries (isValidation = true).
export const sampleCourseList: [string, string, string, number][] = [
  ["RADAR","sim-rs3","RX-5",9],
  ["RADAR","sim-rs3","RX-5 V",9],
  ["RADAR","sim-rs3","RX-2",9],
  ["RADAR","sim-rs3","RX-2 V",9],
  ["RADAR","sim-rs1","RX-11",8],
  ["RADAR","sim-rs1","RX-11 V",8],
  ["RADAR","sim-rs1","RX-12",8],
  ["RADAR","sim-rs1","RX-12 V",8],
  ["RADAR","sim-rs1","RX-2",8],
  ["RADAR","sim-rs1","RX-2 V",8],
  ["RADAR","sim-rs1","RX-3",8],
  ["RADAR","sim-rs1","RX-3 V",8],
  ["RADAR","sim-rs1","RX-4",8],
  ["RADAR","sim-rs1","RX-4 V",8],
  ["RADAR","sim-rs1","RX-6",8],
  ["RADAR","sim-rs1","RX-6 V",8],
  ["RADAR","sim-rs1","RX-7",8],
  ["RADAR","sim-rs1","RX-7 V",8],
  ["RADAR","sim-rs2","RX-5B",6],
  ["RADAR","sim-rs2","RX-5B V",6],
  ["RADAR","sim-rs2","RX-4B",6],
  ["RADAR","sim-rs2","RX-4B V",6],
  ["RADAR","sim-rs2","RX-6B",6],
  ["RADAR","sim-rs2","RX-6B V",6],
  ["RADAR","sim-rs2","GX-4",4],
  ["RADAR","sim-rs2","GX-4 V",4],
  ["RADAR","sim-rs2","GX-3",4],
  ["RADAR","sim-rs2","GX-3 V",4],
  ["TOWER","sim-ts1","TX-11",6],
  ["TOWER","sim-ts1","TX-11 V",6],
  ["TOWER","sim-ts1","TX-12",6],
  ["TOWER","sim-ts1","TX-12 V",6],
  ["TOWER","sim-ts1","TX-21",6],
  ["TOWER","sim-ts1","TX-21 V",6],
  ["TOWER","sim-ts1","TX-22",6],
  ["TOWER","sim-ts1","TX-22 V",6],
  ["TOWER","sim-ts1","TX-3",6],
  ["TOWER","sim-ts1","TX-3 V",6],
  ["TOWER","sim-ts1","TX-4",6],
  ["TOWER","sim-ts1","TX-5",6],
  ["TOWER","sim-ts1","TX-5 V",6],
  ["TOWER","sim-ts1","TX-6",6],
  ["TOWER","sim-ts2","WX-11",4],
  ["TOWER","sim-ts2","WX-11 V",4],
  ["TOWER","sim-ts2","WX-12",4],
  ["TOWER","sim-ts2","WX-12 V",4],
  ["TOWER","sim-ts2","WX-21",4],
  ["TOWER","sim-ts2","WX-21 V",4],
  ["TOWER","sim-ts2","WX-22",4],
  ["TOWER","sim-ts2","WX-22 V",4],
  ["TOWER","sim-ts2","WX-3",4],
  ["TOWER","sim-ts2","WX-3 V",4],
  ["TOWER","sim-ts2","WX-4",4],
  ["TOWER","sim-ts2","WX-5",4],
  ["TOWER","sim-ts2","WX-5 V",4],
  ["TOWER","sim-ts2","WX-6",4],
  ["TOWER","sim-ts2","GX-1",3],
  ["TOWER","sim-ts2","GX-2",3],
  ["TOWER","sim-ts2","GX-2 V",3],
  ["TOWER","sim-ts2","WX-11",2],
  ["TOWER","sim-ts2","WX-11 V",2],
  ["TOWER","sim-ts2","WX-12",2],
  ["TOWER","sim-ts2","WX-12 V",2],
  ["TOWER","sim-ts2","WX-21",2],
  ["TOWER","sim-ts2","WX-21 V",2],
  ["TOWER","sim-ts2","WX-22",2],
  ["TOWER","sim-ts2","WX-22 V",2],
  ["TOWER","sim-ts2","WX-3",2],
  ["TOWER","sim-ts2","WX-3 V",2],
  ["TOWER","sim-ts2","WX-4",2],
  ["TOWER","sim-ts2","WX-5",2],
  ["TOWER","sim-ts2","WX-5 V",2],
  ["TOWER","sim-ts2","WX-6",2],
  ["TOWER","sim-ts2","GX-1",2],
  ["TOWER","sim-ts2","GX-2",2],
  ["TOWER","sim-ts2","GX-2 V",2],
  ["TOWER","sim-ts2","WX-11",2],
  ["TOWER","sim-ts2","WX-11 V",2],
  ["TOWER","sim-ts2","WX-12",2],
  ["TOWER","sim-ts2","WX-12 V",2],
  ["TOWER","sim-ts2","WX-21",2],
  ["TOWER","sim-ts2","WX-21 V",2],
  ["TOWER","sim-ts2","WX-22",2],
  ["TOWER","sim-ts2","WX-22 V",2],
  ["TOWER","sim-ts2","WX-3",2],
  ["TOWER","sim-ts2","WX-3 V",2],
  ["TOWER","sim-ts2","WX-4",2],
  ["TOWER","sim-ts2","WX-5",2],
  ["TOWER","sim-ts2","WX-5 V",2],
  ["TOWER","sim-ts2","WX-6",2],
  ["TOWER","sim-ts2","GX-1",2],
  ["TOWER","sim-ts2","GX-2",2],
  ["TOWER","sim-ts2","GX-2 V",2],
]

// ── DimAssignments ──────────────────────────────────────────────────────
// The `appliesTo` token uses program tokens (RADAR/TOWER) which the
// program-scoping logic relies on; its label is swapped at render via
// programDisplay().
export const sampleAssignments: Assignment[] = [
  {"id":"asn-1","code":"L","description":"Annual Leave","group":"Leave","type":"Leave","appliesTo":"RADAR / TOWER","active":true,"sortOrder":1},
  {"id":"asn-2","code":"LP","description":"Leave Plan","group":"Leave","type":"Leave Plan","appliesTo":"RADAR / TOWER","active":true,"sortOrder":2},
  {"id":"asn-3","code":"Lr","description":"Leave Request","group":"Leave","type":"Leave Request","appliesTo":"RADAR / TOWER","active":true,"sortOrder":3},
  {"id":"asn-4","code":"WR","description":"Work Remotely","group":"Work Arrangement","type":"Remote Work","appliesTo":"RADAR / TOWER","active":true,"sortOrder":4},
  {"id":"asn-5","code":"CoC","description":"Competence Assessment","group":"Assessment","type":"Assessment","appliesTo":"RADAR / TOWER","active":true,"sortOrder":5},
  {"id":"asn-6","code":"COCA","description":"Competence Assessor","group":"Assessment","type":"Assessor Duty","appliesTo":"RADAR / TOWER","active":true,"sortOrder":6},
  {"id":"asn-7","code":"OJTI","description":"On the Job Training Instructor","group":"Training","type":"Instructor","appliesTo":"RADAR / TOWER","active":true,"sortOrder":7},
  {"id":"asn-8","code":"OJT","description":"On the Job Trainee","group":"Training","type":"Trainee","appliesTo":"RADAR / TOWER","active":true,"sortOrder":8},
  {"id":"asn-9","code":"NTC","description":"Non Technical Course","group":"Training","type":"Course","appliesTo":"RADAR / TOWER","active":true,"sortOrder":9},
  {"id":"asn-10","code":"FST","description":"Feast Duties","group":"Duty","type":"Special Duty","appliesTo":"RADAR / TOWER","active":true,"sortOrder":10},
  {"id":"asn-11","code":"CIT","description":"Classroom Instructional Training","group":"Training","type":"Classroom","appliesTo":"RADAR / TOWER","active":true,"sortOrder":11},
  {"id":"asn-12","code":"Dlt","description":"Day in Lieu Taken","group":"Leave","type":"Lieu Leave","appliesTo":"RADAR / TOWER","active":true,"sortOrder":12},
  {"id":"asn-13","code":"NS","description":"National Service","group":"Leave","type":"National Service","appliesTo":"RADAR / TOWER","active":true,"sortOrder":13},
  {"id":"asn-14","code":"H","description":"Holiday","group":"Leave","type":"Holiday","appliesTo":"RADAR / TOWER","active":true,"sortOrder":14},
  {"id":"asn-15","code":"PH","description":"Public Holiday","group":"Leave","type":"Public Holiday","appliesTo":"RADAR / TOWER","active":true,"sortOrder":15},
  {"id":"asn-16","code":"TTI","description":"Theoretical Training Instructor","group":"Training","type":"Instructor","appliesTo":"RADAR / TOWER","active":true,"sortOrder":16},
  {"id":"asn-17","code":"PL","description":"Paternity Leave","group":"Leave","type":"Paternity Leave","appliesTo":"RADAR / TOWER","active":true,"sortOrder":17},
  {"id":"asn-18","code":"ML","description":"Maternity Leave","group":"Leave","type":"Maternity Leave","appliesTo":"RADAR / TOWER","active":true,"sortOrder":18},
  {"id":"asn-19","code":"BL","description":"Bereavement Leave","group":"Leave","type":"Bereavement Leave","appliesTo":"RADAR / TOWER","active":true,"sortOrder":19},
  {"id":"asn-20","code":"EL","description":"Escort Leave","group":"Leave","type":"Escort Leave","appliesTo":"RADAR / TOWER","active":true,"sortOrder":20},
  {"id":"asn-21","code":"Lu","description":"Unpaid Leave","group":"Leave","type":"Unpaid Leave","appliesTo":"RADAR / TOWER","active":true,"sortOrder":21},
  {"id":"asn-22","code":"WL","description":"Marriage Leave (Wedding)","group":"Leave","type":"Marriage Leave","appliesTo":"RADAR / TOWER","active":true,"sortOrder":22},
  {"id":"asn-23","code":"HL","description":"Hajj Leave","group":"Leave","type":"Hajj Leave","appliesTo":"RADAR / TOWER","active":true,"sortOrder":23},
  {"id":"asn-24","code":"CL","description":"Compassionate Leave","group":"Leave","type":"Compassionate Leave","appliesTo":"RADAR / TOWER","active":true,"sortOrder":24},
  {"id":"asn-25","code":"Exm","description":"Exam Leave","group":"Leave","type":"Exam Leave","appliesTo":"RADAR / TOWER","active":true,"sortOrder":25},
  {"id":"asn-26","code":"OB","description":"Other Business","group":"Duty","type":"Business Duty","appliesTo":"RADAR / TOWER","active":true,"sortOrder":26},
  {"id":"asn-27","code":"Assr","description":"Assessor","group":"Assessment","type":"Assessor Duty","appliesTo":"RADAR / TOWER","active":true,"sortOrder":27},
  {"id":"asn-28","code":"Trg","description":"Training","group":"Training","type":"Training","appliesTo":"RADAR / TOWER","active":true,"sortOrder":28},
  {"id":"asn-29","code":"CR","description":"Classroom","group":"Training","type":"Classroom","appliesTo":"RADAR / TOWER","active":true,"sortOrder":29},
  {"id":"asn-30","code":"CD","description":"Course Design","group":"Training","type":"Course Design","appliesTo":"RADAR / TOWER","active":true,"sortOrder":30},
  {"id":"asn-31","code":"RS3x","description":"Sick Leave RS3","group":"Sick Leave","type":"Sick Leave","appliesTo":"RADAR","active":true,"sortOrder":31},
  {"id":"asn-32","code":"Max","description":"Sick Leave Morning Radar","group":"Sick Leave","type":"Sick Leave","appliesTo":"RADAR","active":true,"sortOrder":32},
  {"id":"asn-33","code":"Mtx","description":"Sick Leave Morning Tower 1","group":"Sick Leave","type":"Sick Leave","appliesTo":"TOWER","active":true,"sortOrder":33},
  {"id":"asn-34","code":"Mwx","description":"Sick Leave Morning Tower 2","group":"Sick Leave","type":"Sick Leave","appliesTo":"TOWER","active":true,"sortOrder":34},
  {"id":"asn-35","code":"Ma","description":"Morning Radar","group":"Roster","type":"Morning Duty","appliesTo":"RADAR","active":true,"sortOrder":35},
  {"id":"asn-36","code":"Mt","description":"Morning Tower 1","group":"Roster","type":"Morning Duty","appliesTo":"TOWER","active":true,"sortOrder":36},
  {"id":"asn-37","code":"Mw","description":"Morning Tower 2","group":"Roster","type":"Morning Duty","appliesTo":"TOWER","active":true,"sortOrder":37},
  {"id":"asn-38","code":"Mo","description":"Morning Office","group":"Office","type":"Morning Office","appliesTo":"RADAR / TOWER","active":true,"sortOrder":38},
  {"id":"asn-39","code":"Mod","description":"Data Prep","group":"Data Prep","type":"Data Prep","appliesTo":"RADAR / TOWER","active":true,"sortOrder":39},
  {"id":"asn-40","code":"TWF","description":"Training Wing Facility","group":"Facility","type":"Facility Duty","appliesTo":"RADAR / TOWER","active":true,"sortOrder":40},
  {"id":"asn-41","code":"Aa","description":"Afternoon Radar","group":"Roster","type":"Afternoon Duty","appliesTo":"RADAR","active":true,"sortOrder":41},
  {"id":"asn-42","code":"At","description":"Afternoon Tower 1","group":"Roster","type":"Afternoon Duty","appliesTo":"TOWER","active":true,"sortOrder":42},
  {"id":"asn-43","code":"Aw","description":"Afternoon Tower 2","group":"Roster","type":"Afternoon Duty","appliesTo":"TOWER","active":true,"sortOrder":43},
  {"id":"asn-44","code":"Ad","description":"Afternoon Data Prep","group":"Data Prep","type":"Afternoon Data Prep","appliesTo":"RADAR / TOWER","active":true,"sortOrder":44},
  {"id":"asn-45","code":"RS3","description":"Radar Sim Hall A","group":"Simulator","type":"Simulator Duty","appliesTo":"RADAR","active":true,"sortOrder":45},
]

// ── DimStaff (roster) ───────────────────────────────────────────────────
// Each entry is [full name, three-letter code, role].
export const sampleRoster: [string, string, string][] = [
  ["James Carter","JCA","Sim Pilot"],
  ["Oliver Bennett","OBE","Sim Pilot"],
  ["Liam Foster","LFO","Sim Pilot"],
  ["Noah Sullivan","NSU","Supervisor"],
  ["Ethan Brooks","EBR","Sim Pilot"],
  ["Lucas Hayes","LHA","Sim Pilot"],
  ["Mason Reed","MRE","Sim Pilot"],
  ["Logan Price","LPR","Supervisor"],
  ["Daniel Ward","DWA","Sim Pilot"],
  ["Henry Cole","HCO","Team Lead"],
  ["Jack Morgan","JMO","Sim Pilot"],
  ["Owen Mills","OMI","Sim Pilot"],
  ["Leo Hunter","LHU","Instructor"],
  ["Nathan Ross","NRO","Sim Pilot"],
  ["Adam Shaw","ASH","Sim Pilot"],
  ["Ryan Gray","RGR","Sim Pilot"],
  ["Dylan Webb","DWE","Sim Pilot"],
  ["Caleb Knight","CKN","Sim Pilot"],
  ["Aaron Boyd","ABY","Sim Pilot"],
  ["Grace Palmer","GPA","Sim Pilot"],
  ["Chloe Barnes","CBA","Supervisor"],
  ["Sophie Newton","SNE","Sim Pilot"],
  ["Emily Dawson","EDA","Sim Pilot"],
  ["Hannah Lloyd","HLL","Sim Pilot"],
  ["Zoe Fisher","ZFI","Sim Pilot"],
  ["Ava Spencer","ASP","Sim Pilot"],
  ["Mia Crawford","MCR","Sim Pilot"],
  ["Ella Stone","EST","Instructor"],
  ["Ruby Hart","RHA","Sim Pilot"],
  ["Isla Dean","IDE","Sim Pilot"],
  ["Freya Lyons","FLY","Sim Pilot"],
  ["Lily Marsh","LMA","Sim Pilot"],
]
