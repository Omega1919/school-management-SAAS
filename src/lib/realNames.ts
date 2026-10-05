/**
 * Real Human Names Dataset & Generator for School Management System
 * Provides authentic, diverse, production-grade names for Teachers, Students, and Parents.
 */

export interface RealTeacherDefinition {
  title: string;
  firstName: string;
  lastName: string;
  fullName: string;
  emailPrefix: string;
  gender: 'Male' | 'Female';
  qualification: string;
}

export const REAL_TEACHERS: RealTeacherDefinition[] = [
  { title: 'Dr.', firstName: 'Arthur', lastName: 'Adebayo', fullName: 'Dr. Arthur Adebayo', emailPrefix: 'arthur.adebayo', gender: 'Male', qualification: 'Ph.D. Mathematics, M.Ed.' },
  { title: 'Mrs.', firstName: 'Grace', lastName: 'Okafor', fullName: 'Mrs. Grace Okafor', emailPrefix: 'grace.okafor', gender: 'Female', qualification: 'M.A. English Education, B.Ed.' },
  { title: 'Mr.', firstName: 'David', lastName: 'Mensah', fullName: 'Mr. David Mensah', emailPrefix: 'david.mensah', gender: 'Male', qualification: 'M.Sc. Physics, B.Sc. Ed.' },
  { title: 'Dr.', firstName: 'Amina', lastName: 'Yusuf', fullName: 'Dr. Amina Yusuf', emailPrefix: 'amina.yusuf', gender: 'Female', qualification: 'Ph.D. Chemistry, M.Sc.' },
  { title: 'Mrs.', firstName: 'Sarah', lastName: 'Jenkins', fullName: 'Mrs. Sarah Jenkins', emailPrefix: 'sarah.jenkins', gender: 'Female', qualification: 'M.Sc. Biology, B.Ed.' },
  { title: 'Mr.', firstName: 'Chidi', lastName: 'Eze', fullName: 'Mr. Chidi Eze', emailPrefix: 'chidi.eze', gender: 'Male', qualification: 'M.Sc. Economics, B.Sc.' },
  { title: 'Ms.', firstName: 'Elena', lastName: 'Rostova', fullName: 'Ms. Elena Rostova', emailPrefix: 'elena.rostova', gender: 'Female', qualification: 'M.Sc. Computer Science' },
  { title: 'Mr.', firstName: 'Samuel', lastName: 'Vance', fullName: 'Mr. Samuel Vance', emailPrefix: 'samuel.vance', gender: 'Male', qualification: 'M.A. Political Science, B.Ed.' },
  { title: 'Mrs.', firstName: 'Fatima', lastName: 'Bello', fullName: 'Mrs. Fatima Bello', emailPrefix: 'fatima.bello', gender: 'Female', qualification: 'M.A. Literature in English' },
  { title: 'Mr.', firstName: 'Marcus', lastName: 'Taylor', fullName: 'Mr. Marcus Taylor', emailPrefix: 'marcus.taylor', gender: 'Male', qualification: 'M.Sc. Environmental Geography' },
  { title: 'Mrs.', firstName: 'Chiamaka', lastName: 'Nwosu', fullName: 'Mrs. Chiamaka Nwosu', emailPrefix: 'chiamaka.nwosu', gender: 'Female', qualification: 'B.Ed. Civic & Social Studies' },
  { title: 'Mr.', firstName: 'Emmanuel', lastName: 'Adeleke', fullName: 'Mr. Emmanuel Adeleke', emailPrefix: 'emmanuel.adeleke', gender: 'Male', qualification: 'M.Sc. Agricultural Science' },
  { title: 'Dr.', firstName: 'Liam', lastName: 'Chen', fullName: 'Dr. Liam Chen', emailPrefix: 'liam.chen', gender: 'Male', qualification: 'Ph.D. Applied Mathematics' },
  { title: 'Ms.', firstName: 'Olivia', lastName: 'Davies', fullName: 'Ms. Olivia Davies', emailPrefix: 'olivia.davies', gender: 'Female', qualification: 'M.Ed. Language Arts' },
  { title: 'Mr.', firstName: 'Tariq', lastName: 'Ibrahim', fullName: 'Mr. Tariq Ibrahim', emailPrefix: 'tariq.ibrahim', gender: 'Male', qualification: 'B.Sc. Ed. Physics' },
  { title: 'Mrs.', firstName: 'Amara', lastName: 'Okonkwo', fullName: 'Mrs. Amara Okonkwo', emailPrefix: 'amara.okonkwo', gender: 'Female', qualification: 'M.Sc. Organic Chemistry' },
  { title: 'Mr.', firstName: 'Anthony', lastName: 'Campbell', fullName: 'Mr. Anthony Campbell', emailPrefix: 'anthony.campbell', gender: 'Male', qualification: 'B.Sc. Ed. Biology' },
  { title: 'Dr.', firstName: 'Elizabeth', lastName: 'Mitchell', fullName: 'Dr. Elizabeth Mitchell', emailPrefix: 'elizabeth.mitchell', gender: 'Female', qualification: 'Ph.D. Economics, B.Ed.' },
  { title: 'Mr.', firstName: 'Kelechi', lastName: 'Harrison', fullName: 'Mr. Kelechi Harrison', emailPrefix: 'kelechi.harrison', gender: 'Male', qualification: 'M.Tech. Information Technology' },
  { title: 'Ms.', firstName: 'Sophia', lastName: 'Anderson', fullName: 'Ms. Sophia Anderson', emailPrefix: 'sophia.anderson', gender: 'Female', qualification: 'M.A. History & Government' },
  { title: 'Mr.', firstName: 'Babatunde', lastName: 'Al-Mansoor', fullName: 'Mr. Babatunde Al-Mansoor', emailPrefix: 'babatunde.almansoor', gender: 'Male', qualification: 'M.A. Comparative Literature' },
  { title: 'Mrs.', firstName: 'Emily', lastName: 'Brooks', fullName: 'Mrs. Emily Brooks', emailPrefix: 'emily.brooks', gender: 'Female', qualification: 'B.Sc. Geography & GIS' },
  { title: 'Mr.', firstName: 'Gabriel', lastName: 'Torres', fullName: 'Mr. Gabriel Torres', emailPrefix: 'gabriel.torres', gender: 'Male', qualification: 'B.Ed. Social Studies' },
  { title: 'Ms.', firstName: 'Chloe', lastName: 'Bennett', fullName: 'Ms. Chloe Bennett', emailPrefix: 'chloe.bennett', gender: 'Female', qualification: 'M.Sc. Agronomy' },
  { title: 'Mr.', firstName: 'Kwame', lastName: 'Foster', fullName: 'Mr. Kwame Foster', emailPrefix: 'kwame.foster', gender: 'Male', qualification: 'M.Sc. Pure Mathematics' },
  { title: 'Mrs.', firstName: 'Folake', lastName: 'Gomez', fullName: 'Mrs. Folake Gomez', emailPrefix: 'folake.gomez', gender: 'Female', qualification: 'B.A. English Literature' },
  { title: 'Mr.', firstName: 'Alexander', lastName: 'Ward', fullName: 'Mr. Alexander Ward', emailPrefix: 'alexander.ward', gender: 'Male', qualification: 'B.Sc. Physics' },
  { title: 'Dr.', firstName: 'Carlos', lastName: 'Rivera', fullName: 'Dr. Carlos Rivera', emailPrefix: 'carlos.rivera', gender: 'Male', qualification: 'Ph.D. Biochemistry' },
  { title: 'Mrs.', firstName: 'Zainab', lastName: 'Cooper', fullName: 'Mrs. Zainab Cooper', emailPrefix: 'zainab.cooper', gender: 'Female', qualification: 'B.Sc. Microbiology' },
  { title: 'Mr.', firstName: 'Matthew', lastName: 'Sanders', fullName: 'Mr. Matthew Sanders', emailPrefix: 'matthew.sanders', gender: 'Male', qualification: 'B.Sc. Accounting & Economics' },
];

export const MALE_FIRST_NAMES: string[] = [
  'Liam', 'Noah', 'Oliver', 'James', 'Elijah', 'Lucas', 'Alexander', 'Ethan', 'Daniel', 'Matthew',
  'Samuel', 'David', 'Gabriel', 'Anthony', 'Isaiah', 'Kelechi', 'Chidi', 'Emeka', 'Babatunde', 'Adebayo',
  'Tariq', 'Zain', 'Omar', 'Bilal', 'Kwame', 'Kofi', 'Chen', 'Carlos', 'Mateo', 'Nathaniel',
  'Caleb', 'Joshua', 'Isaac', 'Julian', 'Aaron', 'Tobias', 'Jaden', 'Zubair', 'Obinna', 'Chukwuma',
  'Dapo', 'Farouk', 'Mustapha', 'Tobi', 'Temidayo', 'Femi', 'Kareem', 'Suleiman', 'Somto', 'Ifeanyi',
  'Mason', 'Logan', 'Jackson', 'Levi', 'Sebastian', 'Henry', 'Owen', 'Wyatt', 'Carter', 'Jayden',
];

export const FEMALE_FIRST_NAMES: string[] = [
  'Emma', 'Olivia', 'Ava', 'Sophia', 'Isabella', 'Mia', 'Harper', 'Evelyn', 'Abigail', 'Emily',
  'Elizabeth', 'Chloe', 'Grace', 'Amara', 'Chiamaka', 'Ngozi', 'Folake', 'Aisha', 'Fatima', 'Zainab',
  'Amina', 'Zara', 'Mei', 'Yuna', 'Elena', 'Camila', 'Valentina', 'Hannah', 'Maya', 'Nora',
  'Leila', 'Miriam', 'Adanna', 'Chioma', 'Blessing', 'Halima', 'Khadijah', 'Simisola', 'Oluwaseun', 'Eniola',
  'Zarah', 'Nafisa', 'Somkele', 'Chidinma', 'Temiloluwa', 'Omotola', 'Busayo', 'Rukayat', 'Maryam', 'Hassana',
  'Victoria', 'Penelope', 'Riley', 'Layla', 'Lillian', 'Aubrey', 'Addison', 'Ellie', 'Stella', 'Natalie',
];

export const SURNAMES: string[] = [
  'Adebayo', 'Okafor', 'Adeleke', 'Ibrahim', 'Taylor', 'Anderson', 'Mensah', 'Eze', 'Bello', 'Nwosu',
  'Vance', 'Chen', 'O\'Connor', 'Holloway', 'Davies', 'Mitchell', 'Al-Mansoor', 'Rostova', 'Okonkwo', 'Harrison',
  'Campbell', 'Edwards', 'Jenkins', 'Cooper', 'Gomez', 'Patel', 'Morgan', 'Brooks', 'Kelly', 'Sanders',
  'Bennett', 'Ward', 'Torres', 'Peterson', 'Reed', 'Cook', 'Bailey', 'Rivera', 'Gray', 'Diaz',
  'Hayes', 'Myers', 'Ford', 'Hamilton', 'Graham', 'Sullivan', 'Wallace', 'Woods', 'Cole', 'West',
  'Jordan', 'Owens', 'Reynolds', 'Fisher', 'Ellis', 'Gibson', 'McDonald', 'Cruz', 'Marshall', 'Ortiz',
  'Murray', 'Freeman', 'Wells', 'Webb', 'Simpson', 'Stevens', 'Tucker', 'Porter', 'Hunter', 'Hicks',
  'Crawford', 'Henry', 'Boyd', 'Mason', 'Morales', 'Kennedy', 'Warren', 'Dixon', 'Ramos', 'Reyes',
  'Burns', 'Gordon', 'Shaw', 'Holmes', 'Rice', 'Robertson', 'Hunt', 'Black', 'Daniels', 'Palmer',
  'Mills', 'Nichols', 'Grant', 'Knight', 'Ferguson', 'Rose', 'Stone', 'Hawkins', 'Fowler', 'Suleiman',
];

export const PARENT_TITLES_MALE = ['Mr.', 'Dr.', 'Chief', 'Engr.', 'Pastor', 'Prof.'];
export const PARENT_TITLES_FEMALE = ['Mrs.', 'Dr.', 'Ms.', 'Chief Mrs.', 'Lady', 'Prof.'];

/**
 * Returns a realistic human identity for student index (1-based)
 */
export function getStudentRealName(index: number, domain: string = 'test.school.internal'): {
  firstName: string;
  lastName: string;
  fullName: string;
  gender: 'Male' | 'Female';
  email: string;
} {
  const isFemale = index % 2 === 0;
  const firstNamePool = isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES;

  // Deterministic indexing yielding 100% unique names across 500 students
  const fIdx = Math.floor((index - 1) / 2) % firstNamePool.length;
  const lIdx = (Math.floor((index - 1) / (2 * firstNamePool.length)) * 17 + (index - 1)) % SURNAMES.length;

  const firstName = firstNamePool[fIdx];
  const lastName = SURNAMES[lIdx];

  // Format clean human email derived directly from their real name
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const email = `${cleanFirst}.${cleanLast}@${domain}`;

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    gender: isFemale ? 'Female' : 'Male',
    email,
  };
}

/**
 * Returns a realistic human identity for parent linked to their child's surname
 */
export function getParentRealName(
  index: number,
  childLastName?: string,
  relationship: 'Father' | 'Mother' | 'Guardian' = 'Mother',
  domain: string = 'test.school.internal'
): {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  title: string;
} {
  const isFather = relationship === 'Father';
  const firstNamePool = isFather ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;
  const titlePool = isFather ? PARENT_TITLES_MALE : PARENT_TITLES_FEMALE;

  const fIdx = (index * 7 + 13) % firstNamePool.length;
  const firstName = firstNamePool[fIdx];
  const lastName = childLastName || SURNAMES[(index * 11 + 3) % SURNAMES.length];
  const title = titlePool[index % titlePool.length];

  const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const email = `${cleanFirst}.${cleanLast}@${domain}`;

  return {
    firstName,
    lastName,
    title,
    fullName: `${title} ${firstName} ${lastName}`,
    email,
  };
}
