/*
 * js/departments.js — Department/Branch reference data for the
 * Student Dashboard upgrade. This is general career-guidance
 * reference data (typical role titles, typical skills, typical
 * company categories) — NOT real job/company listings. Real
 * opportunity/company recommendations always come from
 * js/opportunities.js's DATA.OPPORTUNITIES (+ industry-posted ones),
 * never from this file. See js/recommendations.js for how the two are
 * combined.
 */

const Departments = (() => {
  const DEPARTMENTS = [
    "Biotechnology Engineering",
    "Computer Science Engineering",
    "Information Technology",
    "Electronics and Communication Engineering",
    "Electrical and Electronics Engineering",
    "Mechanical Engineering",
    "Civil Engineering",
    "Chemical Engineering",
    "Biomedical Engineering",
    "Artificial Intelligence & Data Science",
    "Artificial Intelligence & Machine Learning",
    "Other",
  ];

  // Maps each department to the OPP_DOMAINS (js/data.js DATA.OPP_DOMAINS)
  // that its real opportunities/companies are drawn from. Departments
  // with no matching domain in the current catalog correctly show an
  // empty state rather than fabricated results (spec: "Real Data Only").
  const DEPARTMENT_DOMAINS = {
    "Computer Science Engineering": ["Software Development", "Python Development", "Data Science", "Data Analytics", "Machine Learning", "AI", "Cloud", "Cybersecurity"],
    "Information Technology": ["Software Development", "Cloud", "Data Analytics", "Cybersecurity", "Python Development"],
    "Artificial Intelligence & Data Science": ["AI", "Machine Learning", "Data Science", "Data Analytics"],
    "Artificial Intelligence & Machine Learning": ["AI", "Machine Learning", "Data Science"],
    "Electronics and Communication Engineering": ["Embedded Systems", "IoT"],
    "Electrical and Electronics Engineering": ["Embedded Systems", "IoT"],
    "Mechanical Engineering": [],
    "Civil Engineering": [],
    "Chemical Engineering": [],
    "Biotechnology Engineering": [],
    "Biomedical Engineering": [],
    "Other": [],
  };

  const DEPARTMENT_ROLE_SUGGESTIONS = {
    "Biotechnology Engineering": ["Biotechnologist", "Research Associate", "Quality Control Analyst", "Quality Assurance Associate", "Bioinformatics Analyst", "Microbiology Analyst", "Molecular Biology Research Assistant", "Clinical Research Associate", "Bioprocess Associate", "Pharmaceutical Research Assistant"],
    "Computer Science Engineering": ["Software Developer", "Web Developer", "Data Analyst", "AI/ML Engineer", "Backend Developer"],
    "Information Technology": ["Software Developer", "Cloud Support Engineer", "Data Analyst", "Systems Administrator", "QA Engineer"],
    "Electronics and Communication Engineering": ["Embedded Systems Engineer", "IoT Engineer", "VLSI Design Engineer", "Communication Systems Engineer"],
    "Electrical and Electronics Engineering": ["Electrical Design Engineer", "Embedded Systems Engineer", "Power Systems Engineer", "IoT Engineer"],
    "Mechanical Engineering": ["Design Engineer", "Production Engineer", "Manufacturing Engineer", "CAD Engineer"],
    "Civil Engineering": ["Site Engineer", "Structural Design Engineer", "Project Engineer", "Quantity Surveyor"],
    "Chemical Engineering": ["Process Engineer", "Chemical Plant Engineer", "Quality Control Chemist", "R&D Engineer"],
    "Biomedical Engineering": ["Biomedical Equipment Engineer", "Clinical Engineer", "Medical Devices R&D Associate", "Regulatory Affairs Associate"],
    "Artificial Intelligence & Data Science": ["Data Scientist", "Machine Learning Engineer", "Data Analyst", "AI Engineer"],
    "Artificial Intelligence & Machine Learning": ["Machine Learning Engineer", "AI Engineer", "Data Scientist"],
    "Other": [],
  };

  const DEPARTMENT_COMPANY_CATEGORIES = {
    "Biotechnology Engineering": ["Biotechnology companies", "Pharmaceutical companies", "Biotech research organizations", "Diagnostics companies", "Healthcare technology companies", "Food biotechnology companies", "Agricultural biotechnology companies", "Bioinformatics companies", "Life-science companies"],
    "Computer Science Engineering": ["Software product companies", "IT services companies", "Cloud/SaaS companies", "Startups", "AI/ML companies"],
    "Information Technology": ["IT services companies", "Cloud infrastructure companies", "Cybersecurity firms", "Data analytics companies"],
    "Electronics and Communication Engineering": ["Semiconductor companies", "Telecom companies", "IoT/embedded systems companies", "Consumer electronics companies"],
    "Electrical and Electronics Engineering": ["Power & energy companies", "Electronics manufacturers", "Embedded systems companies", "Automation companies"],
    "Mechanical Engineering": ["Automotive companies", "Manufacturing companies", "Industrial design firms", "Heavy engineering companies"],
    "Civil Engineering": ["Construction companies", "Infrastructure & real estate firms", "Structural consultancy firms", "Government engineering bodies"],
    "Chemical Engineering": ["Chemical manufacturing companies", "Petrochemical companies", "Process industries", "Materials companies"],
    "Biomedical Engineering": ["Medical device companies", "Healthcare technology companies", "Hospitals & clinical research organizations", "Regulatory/quality bodies"],
    "Artificial Intelligence & Data Science": ["AI/ML companies", "Data analytics companies", "Software product companies", "Research organizations"],
    "Artificial Intelligence & Machine Learning": ["AI/ML companies", "Software product companies", "Research organizations"],
    "Other": [],
  };

  const DEPARTMENT_SKILLS = {
    "Biotechnology Engineering": ["Molecular Biology", "Genetic Engineering", "Microbiology", "Cell Culture", "Bioinformatics", "Python", "R", "Data Analysis", "Biostatistics", "Laboratory Techniques"],
    "Computer Science Engineering": ["Python", "Java", "SQL", "Data Structures", "Git", "Machine Learning", "Cloud", "Problem Solving"],
    "Information Technology": ["SQL", "Cloud", "Python", "Networking", "Cybersecurity", "Data Analysis", "Git"],
    "Electronics and Communication Engineering": ["C/C++", "Embedded C", "Signal Processing", "IoT", "PCB Design", "Problem Solving"],
    "Electrical and Electronics Engineering": ["C/C++", "Circuit Design", "Embedded Systems", "Power Systems", "MATLAB", "Problem Solving"],
    "Mechanical Engineering": ["CAD", "SolidWorks", "AutoCAD", "Thermodynamics", "Manufacturing Processes", "Problem Solving"],
    "Civil Engineering": ["AutoCAD", "Structural Analysis", "Project Management", "Surveying", "Construction Materials"],
    "Chemical Engineering": ["Process Simulation", "Chemical Analysis", "Safety Management", "Quality Control", "Problem Solving"],
    "Biomedical Engineering": ["Biomedical Instrumentation", "Signal Processing", "Regulatory Standards", "MATLAB", "Data Analysis"],
    "Artificial Intelligence & Data Science": ["Python", "Machine Learning", "Statistics", "Data Analysis", "SQL", "Data Visualization"],
    "Artificial Intelligence & Machine Learning": ["Python", "Machine Learning", "Deep Learning", "Statistics", "Data Analysis"],
    "Other": [],
  };

  function domainsFor(department) {
    return DEPARTMENT_DOMAINS[department] || [];
  }
  function roleSuggestionsFor(department) {
    return DEPARTMENT_ROLE_SUGGESTIONS[department] || [];
  }
  function companyCategoriesFor(department) {
    return DEPARTMENT_COMPANY_CATEGORIES[department] || [];
  }
  function skillsFor(department) {
    return DEPARTMENT_SKILLS[department] || [];
  }

  return { DEPARTMENTS, domainsFor, roleSuggestionsFor, companyCategoriesFor, skillsFor };
})();
