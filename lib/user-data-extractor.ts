// lib/user-data-extractor.ts
// Extract user data from uploaded files (resume, etc.) for AI Vision

export interface UserData {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  summary?: string;
  [key: string]: string | undefined;
}

/**
 * Extract user data from resume text
 */
export function extractUserDataFromResume(resumeText: string): UserData {
  const userData: UserData = {};
  
  // Extract email
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  const emails = resumeText.match(emailRegex);
  if (emails && emails.length > 0) {
    userData.email = emails[0];
  }
  
  // Extract phone
  const phoneRegex = /(\+?\d{1,2}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const phones = resumeText.match(phoneRegex);
  if (phones && phones.length > 0) {
    userData.phone = phones[0];
  }
  
  // Extract name (first line, usually)
  const lines = resumeText.split('\n').filter(l => l.trim());
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    // Check if first line looks like a name (2-3 words, capitalized)
    if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(firstLine)) {
      userData.fullName = firstLine;
      const nameParts = firstLine.split(' ');
      userData.firstName = nameParts[0];
      userData.lastName = nameParts[nameParts.length - 1];
    }
  }
  
  // Extract LinkedIn
  const linkedinRegex = /linkedin\.com\/in\/[\w-]+/gi;
  const linkedin = resumeText.match(linkedinRegex);
  if (linkedin && linkedin.length > 0) {
    userData.linkedin = `https://${linkedin[0]}`;
  }
  
  // Extract GitHub
  const githubRegex = /github\.com\/[\w-]+/gi;
  const github = resumeText.match(githubRegex);
  if (github && github.length > 0) {
    userData.github = `https://${github[0]}`;
  }
  
  // Extract website
  const websiteRegex = /(https?:\/\/)?(www\.)?[\w-]+\.[\w]{2,}(\/[\w-]*)?/gi;
  const websites = resumeText.match(websiteRegex);
  if (websites && websites.length > 0) {
    // Filter out email domains and known services
    const personalWebsite = websites.find(w => 
      !w.includes('linkedin') && 
      !w.includes('github') && 
      !w.includes('@')
    );
    if (personalWebsite) {
      userData.website = personalWebsite.startsWith('http') 
        ? personalWebsite 
        : `https://${personalWebsite}`;
    }
  }
  
  return userData;
}

/**
 * Get user data from session/file upload
 */
export async function getUserDataFromSession(sessionId: string): Promise<UserData> {
  // TODO: Fetch from database or session storage
  // For now, return empty object
  return {};
}

/**
 * Parse user data from manual input
 */
export function parseUserInput(input: {
  name?: string;
  email?: string;
  phone?: string;
  [key: string]: any;
}): UserData {
  const userData: UserData = {};
  
  if (input.name) {
    userData.fullName = input.name;
    const nameParts = input.name.split(' ');
    if (nameParts.length >= 2) {
      userData.firstName = nameParts[0];
      userData.lastName = nameParts[nameParts.length - 1];
    }
  }
  
  if (input.email) {
    userData.email = input.email;
  }
  
  if (input.phone) {
    userData.phone = input.phone;
  }
  
  // Copy any other fields directly
  Object.keys(input).forEach(key => {
    if (!['name', 'email', 'phone'].includes(key)) {
      userData[key] = input[key];
    }
  });
  
  return userData;
}

/**
 * Merge user data from multiple sources
 */
export function mergeUserData(...sources: UserData[]): UserData {
  return sources.reduce((merged, source) => {
    return { ...merged, ...source };
  }, {});
}
