'use strict';
/* Starting data: people, projects and leave policy. Pass demo=true to add sample tasks, attendance and leave. */
function ds(d){return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2)}
function dy(n){var d=new Date();d.setDate(d.getDate()+n);return ds(d)}
function wdy(n){var d=new Date();d.setDate(d.getDate()+n);while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()+1);return ds(d)}
function hm(){var d=new Date();return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2)}
function now(){return dy(0)+" "+hm()}
function wdays(f,t){var d=new Date(f+"T00:00:00"),e=new Date(t+"T00:00:00"),n=0;while(d<=e){var g=d.getDay();if(g!==0)n++;d.setDate(d.getDate()+1)}return n}

function seed(demo){
var P=[["Sri Harsha","Operations","Administrator","admin@ingage.in","+91 90000 00001","admin","admin123","Admin",0,"","Onsite"],
["Babu","Operations","Manager","babu@ingage.in","+91 90000 00002",null,"manager123","Manager",1,"","Onsite"],
["Jeyaram","Operations","Program Manager","jeyaram@ingage.in","+91 90000 00003",null,"lead123","Program Manager",2,"Handling team members' work allocation","Remote"],
["Abishek V","Operations","Team Lead","abishek@ingage.in","+91 98765 43210",null,"lead123","Team Lead",3,"Google Data Analytics course, Cloud Engineering and GCCF, document follow-up","Remote"],
["Abinesh","Operations","Team Member","abinesh@ingage.in","+91 98765 43211",null,null,"Employee",4,"Development and research","Onsite"],
["Madhan S","Operations","Team Member","madhan@ingage.in","+91 98765 43212",null,null,"Employee",4,"","Remote"],
["Silambarasan M","Operations","Team Member","silambarasan@ingage.in","+91 98765 43213",null,null,"Employee",4,"","Remote"],
["Deepika","Operations","Team Member","deepika@ingage.in","+91 98765 43214",null,null,"Employee",4,"Cloud Computing Google course completion","Remote"],
["Dhivya B","Operations","Team Member","dhivya@ingage.in","+91 98765 43215",null,null,"Employee",4,"","Remote"],
["Divya G","Operations","Team Member","divya@ingage.in","+91 98765 43216",null,null,"Employee",4,"Handling Data Analytics","Onsite"],
["Gunaseelan","Operations","Intern","gunaseelan@ingage.in","+91 98765 43217",null,null,"Employee",4,"Intern work management","Remote"],
["Pooja","Operations","Team Member","pooja@ingage.in","+91 98765 43218",null,null,"Employee",4,"","Onsite"],
["Rajashree","Operations","Team Member","rajashree@ingage.in","+91 98765 43219",null,null,"Employee",4,"Preparing PPT for NM10 EOI","Onsite"],
["Santheesh","Operations","Team Member","santheesh@ingage.in","+91 98765 43220",null,null,"Employee",4,"Development and research","Onsite"],
["Pavithra","Operations","Team Member","pavithra@ingage.in","+91 98765 43221",null,null,"Employee",4,"Gen AI Google course completion","Onsite"]];
var E=P.map(function(p,i){return{id:i+1,name:p[0],dept:p[1],desig:p[2],email:p[3],phone:p[4],u:p[5]||p[0].split(" ")[0].toLowerCase(),pw:p[6]||"emp123",role:p[7],mgr:p[8],work:p[9]||"",mode:p[10]||"Onsite",status:"Active",joined:"2024-01-15"}});
var PJ=[{n:"Google Course Completion",d:"Google course enrolment and completion tracking"},{n:"Data Analytics",d:"Data Analytics course handling and completion"},{n:"Cloud Engineering & GCCF",d:"Cloud engineering and GCCF course work"},{n:"Document Follow-up",d:"Collecting and following up course documents"},{n:"Development & Research",d:"Development tasks and research work"},{n:"Intern Management",d:"Managing intern work"},{n:"NM10 EOI",d:"NM10 Expression of Interest PPT"},{n:"Team Allocation",d:"Allocating work to team members"},{n:"General Operations",d:"Day-to-day team operations"}];
var WK={0:[[8,"Weekly status update"],[8,"Team coordination follow-up"],[8,"Pending items review"],[8,"Weekly report preparation"],[8,"Process documentation"]],
3:[[7,"Allocate weekly work to team members"],[7,"Review team workload and rebalance"]],
4:[[1,"Google Data Analytics course completion tracking"],[2,"Cloud Engineering course follow-up"],[2,"GCCF enrolment and completion follow-up"],[3,"Course document follow-up with colleges"],[3,"Verify and file received documents"]],
5:[[4,"Feature development sprint"],[4,"Research: compare technical approaches"],[4,"Code review and bug fixes"],[4,"Prototype documentation"],[4,"Technical research summary"]],
8:[[0,"Cloud Computing Google course completion tracking"],[0,"Follow up with pending Cloud Computing learners"],[0,"Collect Cloud Computing completion certificates"],[0,"Send Cloud Computing progress reminders"],[0,"Cloud Computing completion report"]],
10:[[1,"Data Analytics course handling"],[1,"Data Analytics completion drive attendance"],[1,"Learner support for Data Analytics"],[1,"Follow up with SPOCs"],[1,"Data Analytics completion report"]],
11:[[5,"Plan intern work schedule"],[5,"Allocate daily tasks to interns"],[5,"Review intern progress"],[5,"Follow up intern reports"],[5,"Intern onboarding documents"]],
13:[[6,"Prepare NM10 EOI PPT"],[6,"Collect content for EOI slides"],[6,"Review EOI deck with team lead"],[6,"Design EOI slides"],[6,"Finalise EOI submission"]],
14:[[4,"Feature development sprint"],[4,"Research: compare technical approaches"],[4,"Code review and bug fixes"],[4,"Prototype documentation"],[4,"Technical research summary"]],
15:[[0,"Gen AI Google course completion tracking"],[0,"Follow up with Gen AI learners"],[0,"Verify Gen AI completion certificates"],[0,"Send Gen AI progress reminders"],[0,"Gen AI completion report"]]},
ST=["Completed","In Progress","Pending","Accepted","Completed","In Progress","Completed"],T=[],id=1;
E.forEach(function(e){if(e.role==="Admin"||e.role==="Manager")return;var c=e.role==="Team Lead"?2:5;for(var j=0;j<c;j++){var n=id++,st=ST[n%7];if(n%11===0)st="Rejected";var wl=WK[e.id]||WK[0],tn=wl[j%wl.length],b=dy(-(n%6)-2),ev={as:b+" 10:00"};
if(st==="Rejected")ev.rj=b+" 12:10";if(st==="Accepted"||st==="In Progress"||st==="Completed")ev.ac=b+" 11:"+(10+n%40);if(st==="In Progress"||st==="Completed")ev.st=b+" 14:"+(10+n%40);if(st==="Completed")ev.dn=dy(-(n%12)-1)+" 16:"+(10+n%40);
T.push({id:n,title:tn[1]+" #"+n,project:PJ[tn[0]].n,emp:e.id,by:e.mgr,pri:["High","Medium","Low"][n%3],due:dy(st==="Completed"?-(n%9)-1:(n%12)-2),st:st,pr:st==="Completed"?100:st==="In Progress"?30+(n%6)*10:0,hrs:6+(n%6)*3,inst:"Follow the project brief and share the final output.",note:"",rr:"",rej:st==="Rejected"?"Not enough bandwidth this week":"",ev:ev})}});
var A={};for(var d=0;d<=7;d++){A[dy(-d)]={};E.forEach(function(x){if(x.role==="Admin")return;if(d===0){if(x.id%4===0)return;A[dy(0)][x.id]={s:"P",in:"09:"+("0"+(x.id*7%45)).slice(-2),late:x.id*7%45>30};return}var v=(x.id*7+d)%11===0?"A":(x.id+d)%13===0?"L":"P";A[dy(-d)][x.id]=v==="P"?{s:"P",in:"09:0"+(x.id%6),out:"17:3"+(d%6),late:false}:{s:v}})}
var lv=[[4,"Casual Leave",wdy(-20),wdy(-19),"Family function","Approved",3,"",5],[5,"Sick Leave",wdy(-9),wdy(-9),"Fever","Approved",3,"",6],[7,"Casual Leave",wdy(-16),wdy(-15),"Personal work","Approved",3,"",8],[8,"Earned Leave",wdy(-30),wdy(-28),"Vacation","Approved",3,"",7],[10,"Casual Leave",wdy(-5),wdy(-5),"Personal work","Rejected",3,"Month-end deadline, please reschedule",11],[3,"Casual Leave",wdy(-10),wdy(-10),"Bank work","Approved",2,"",4],[9,"Casual Leave",wdy(3),wdy(4),"Family function","Pending",0,"",8],[12,"Sick Leave",wdy(7),wdy(7),"Medical appointment","Pending",0,"",13],[6,"Earned Leave",wdy(10),wdy(12),"Trip","Pending",0,"",4],[2,"Casual Leave",wdy(14),wdy(14),"Personal work","Pending",0,"",3]]
.map(function(x,i){var dec=x[5]!=="Pending";return{id:i+1,emp:x[0],type:x[1],from:x[2],to:x[3],days:wdays(x[2],x[3]),reason:x[4],st:x[5],at:dy(-22+i),by:dec?x[6]:0,dat:dec?dy(-20+i):"",note:x[7],alt:x[8]}});
if(!demo){T=[];A={};lv=[]}return{E:E,T:T,A:A,PJ:PJ,L:lv,pol:{types:[{n:"Casual Leave",q:12,d:"Personal or planned time off"},{n:"Sick Leave",q:10,d:"Illness or medical appointments"},{n:"Earned Leave",q:15,d:"Planned vacation – apply at least 7 days ahead"},{n:"Emergency Leave",q:3,d:"Unforeseen urgent situations"},{n:"Loss of Pay",q:0,d:"Unpaid leave when balance is used up (no limit)"}],notice:2,maxConsec:5,sickCert:3}}}

module.exports=seed;
