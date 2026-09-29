const fs = require('fs');
let content = fs.readFileSync('app/page.tsx', 'utf-8');

const replacements = [
  // 1. Partner cards
  [
    `className="flex items-center gap-4 bg-white/60 backdrop-blur-md px-6 py-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 min-w-[200px]"`,
    `className="flex items-center gap-4 px-4 py-3 hover:scale-110 transition-transform duration-500 min-w-[180px]"`
  ],
  // 2. Core Principles
  [
    `className="bg-white p-8 rounded-2xl border border-slate-200 hover:border-primary/30 hover:shadow-xl transition-all duration-300 group shadow-sm"`,
    `className="p-6 hover:translate-x-2 transition-transform duration-500 group"`
  ],
  // 3. Core Capabilities
  [
    `className="group p-8 rounded-3xl bg-white border border-slate-200 hover:shadow-2xl transition-all duration-300 flex flex-col h-full relative overflow-hidden"`,
    `className="group p-6 rounded-3xl bg-white/20 backdrop-blur-xl border border-white/40 hover:bg-white/30 hover:-translate-y-2 transition-all duration-500 flex flex-col h-full relative overflow-hidden"`
  ],
  // 4. Advanced Solutions
  [
    `className="group flex gap-6 p-8 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-white hover:shadow-xl transition-all"`,
    `className="group flex gap-6 p-6 rounded-2xl hover:-translate-y-2 transition-all duration-500"`
  ],
  // 5. Contact Section wrapper
  [
    `className="max-w-5xl mx-auto bg-slate-50 rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden grid lg:grid-cols-5"`,
    `className="max-w-5xl mx-auto bg-white/20 backdrop-blur-2xl rounded-[3rem] border border-white/40 shadow-2xl overflow-hidden grid lg:grid-cols-5"`
  ],
  // 6. Contact Section left panel
  [
    `className="lg:col-span-2 bg-slate-900 p-12 text-white flex flex-col justify-between relative"`,
    `className="lg:col-span-2 bg-slate-900/40 p-12 text-white flex flex-col justify-between relative"`
  ],
  // 7. Contact Section right panel
  [
    `className="lg:col-span-3 p-12 bg-white relative overflow-hidden"`,
    `className="lg:col-span-3 p-12 relative overflow-hidden"`
  ],
  // 8. Footer Threat Trends
  [
    `className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm w-full max-w-sm"`,
    `className="bg-white/20 backdrop-blur-md border border-white/30 rounded-xl p-4 w-full max-w-sm"`
  ],
  // 9. Input boxes globally in contact
  [
    /className="w-full bg-slate-50 border border-slate-200 rounded-xl/g,
    `className="w-full bg-white/30 backdrop-blur-md border border-white/50 rounded-xl shadow-inner`
  ],
  // 10. Fix absolute transparent backgrounds in page
  [
    `className="absolute inset-0 bg-white z-20 flex flex-col items-center justify-center p-12 text-center"`,
    `className="absolute inset-0 bg-slate-100/80 backdrop-blur-xl z-20 flex flex-col items-center justify-center p-12 text-center rounded-[3rem]"`
  ],
  // 11. Fix We Support background box
  [
    `className="bg-primary p-10 md:p-16 rounded-[3rem] relative overflow-hidden shadow-2xl"`,
    `className="bg-primary/80 backdrop-blur-2xl border border-white/20 p-10 md:p-16 rounded-[3rem] relative overflow-hidden shadow-2xl"`
  ]
];

replacements.forEach(([search, replace]) => {
  content = content.replace(search, replace);
});

fs.writeFileSync('app/page.tsx', content);
console.log('Fluid layout applied');
