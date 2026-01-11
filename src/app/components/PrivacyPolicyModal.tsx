import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Shield } from 'lucide-react';

export function PrivacyPolicyModal() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs">
          <Shield className="size-4 mr-1" />
          Privacy Policy
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Privacy Policy</DialogTitle>
          <DialogDescription>2427 (Biggin Hill) Squadron - RAF Air Cadets</DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6 text-sm pb-6">
            {/* Introduction */}
            <section>
              <h3 className="font-semibold text-base mb-2">1. Introduction</h3>
              <p className="text-gray-700">
                2427 (Biggin Hill) Squadron is committed to protecting your personal data and respecting your privacy. This Privacy Policy explains how we collect, use, and protect personal information in accordance with the UK GDPR and the Data Protection Act 2018 and other applicable privacy laws.
              </p>
              <p className="text-gray-700 mt-2">
                <strong>Last Updated:</strong> January 2026
              </p>
            </section>

            {/* Data Controller */}
            <section>
              <h3 className="font-semibold text-base mb-2">2. Who We Are</h3>
              <p className="text-gray-700">
                2427 (Biggin Hill) Squadron RAF Air Cadets is the data controller for personal information collected through this Flight Points system. 
              </p>
              <p className="text-gray-700 mt-2">
                <strong>Squadron Data Protection Contact:</strong> Sgt Jack Penny
              </p>
              <p className="text-gray-700 mt-1">
                <em>Email address to be provided following approval from Commanding Officer. </em>
              </p>
            </section>

            {/* Data Collection */}
            <section>
              <h3 className="font-semibold text-base mb-2">3. What Personal Data We Collect</h3>
              <p className="text-gray-700 mb-2">We collect the following personal data:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Names</strong> - Full name of cadets and staff (format:  Surname Initial)</li>
                <li><strong>Email addresses</strong> - For account access and notifications (staff and NCOs only)</li>
                <li><strong>Role information</strong> - Cadet, Point Giver, SNCO, or Staff designation</li>
                <li><strong>Flight assignments</strong> - Which flight (1, 2, 3, or 4) you belong to</li>
                <li><strong>Attendance records</strong> - Dates, times, and status (present/absent) at squadron activities</li>
                <li><strong>Points/Awards data</strong> - Flight points earned, achievements, reasons, and who awarded them</li>
                <li><strong>User IDs</strong> - Unique identifiers for system management</li>
                <li><strong>Uploaded Evidence Files</strong> - Images and documents uploaded to support achievement ticket requests</li>
                <li><strong>Notification Data</strong> - Records of notifications sent regarding points, attendance, and ticket updates</li>
                <li><strong>Request/Ticket Data</strong> - Information about achievements submitted for review, including descriptions, categories, requested points, and approval status</li>
                <li><strong>User Activity Metadata</strong> - Information about who submitted data (e.g., "given by," "submitted by" fields) and timestamps of actions</li>
                <li><strong>Join Codes</strong> - Time-limited access codes used during signup (automatically expire)</li>
                <li><strong>Authentication Tokens</strong> - Temporary session tokens and admin verification status stored in your browser</li>
              </ul>
              <p className="text-gray-700 mt-2">
                We do not collect any special category data (for example medical, biometric, or safeguarding information) via this system.
              </p>
            </section>

            {/* Legal Basis */}
            <section>
              <h3 className="font-semibold text-base mb-2">4. Legal Basis for Processing</h3>
              <p className="text-gray-700 mb-2">We rely on the following legal bases to process personal data:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Legitimate interests: </strong> Managing squadron activities, tracking attendance, and awarding flight points for the effective operation of 2427 Squadron</li>
                <li><strong>Legal obligation:</strong> Compliance with RAF Air Cadets and MOD regulatory requirements where applicable</li>
              </ul>
              <p className="text-gray-700 mt-2">
                <em>Note:  Parental consent requirements for cadets under 16 are under review and will be updated following consultation with the Commanding Officer.</em>
              </p>
            </section>

            {/* How We Collect Data */}
            <section>
              <h3 className="font-semibold text-base mb-2">5. How We Collect Your Data</h3>
              <p className="text-gray-700 mb-2">We collect personal data through:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Account Registration</strong> - Email and name provided during signup (staff and NCOs only; cadets can use the system without accounts)</li>
                <li><strong>Direct Input</strong> - Points, attendance, and cadet information entered by authorized staff, SNCOs, and Point Givers</li>
                <li><strong>File Uploads</strong> - Images and documents you voluntarily upload as evidence for achievement ticket requests</li>
                <li><strong>OCR Processing</strong> - Attendance data extracted from uploaded attendance register photos using optical character recognition</li>
                <li><strong>Automated Processes</strong> - System-generated IDs, timestamps, bulk operation tracking, and attendance points</li>
              </ul>
            </section>

            {/* How We Use Data */}
            <section>
              <h3 className="font-semibold text-base mb-2">6. How We Use Your Data</h3>
              <p className="text-gray-700 mb-2">We use your personal data for the following purposes:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li>Managing cadet accounts and flight assignments</li>
                <li>Tracking attendance at squadron activities and awarding attendance points</li>
                <li>Recording and managing flight points and achievements</li>
                <li>Processing achievement tickets submitted by cadets</li>
                <li>Producing leaderboards and performance reports (visible only to authorized squadron members)</li>
                <li>Sending notifications about points awarded, attendance, and ticket status updates</li>
                <li>Exporting data to CSV spreadsheets for displaying leaderboards (Flight Point Leads only)</li>
                <li>Ensuring data integrity and system security through integrity checks</li>
              </ul>
            </section>

            {/* Data Storage */}
            <section>
              <h3 className="font-semibold text-base mb-2">7. Where Your Data Is Stored</h3>
              
              <p className="text-gray-700 mb-2">
                <strong>Primary Storage - Supabase (Cloud Database):</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2 mb-3">
                <li><strong>Database: </strong> All cadet, points, attendance, ticket, and notification data is stored in Supabase KV Store (key-value database)</li>
                <li><strong>File Storage:</strong> Uploaded evidence files (images/documents) are stored in Supabase Storage buckets with public access URLs</li>
                <li><strong>Authentication:</strong> User accounts and login sessions managed by Supabase Auth</li>
                <li>Supabase provides GDPR-aligned cloud hosting with appropriate security safeguards</li>
              </ul>

              <p className="text-gray-700 mb-2">
                <strong>Browser Storage (Your Device Only):</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2 mb-3">
                <li><strong>localStorage:</strong> Caches cadet data, points, and attendance for offline access and faster performance.  Also stores file metadata indexes and UI preferences.  This data never leaves your device.</li>
                <li><strong>sessionStorage:</strong> Stores temporary admin PIN verification status and UI state (automatically cleared when browser closes)</li>
                <li>You can clear browser storage at any time through your browser settings without affecting the central database</li>
              </ul>

              <p className="text-gray-700 mb-2">
                <strong>CSV Data Exports (For Leaderboards):</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2 mb-3">
                <li>Flight Point Leads can export data to CSV format for creating leaderboard spreadsheets in Excel</li>
                <li>Exported CSV files are downloaded directly to the user's device - they are not stored on any server</li>
                <li>Exports contain cadet names, flights, points totals, and attendance summaries</li>
                <li>Users are responsible for securely storing and disposing of exported files</li>
              </ul>

              <p className="text-gray-700 mt-3">
                <strong>Important:</strong> Data is <strong>not</strong> stored on squadron computers, physical servers, or any local infrastructure. All data resides in the cloud (Supabase) or temporarily in your web browser.
              </p>
              
              <p className="text-gray-700 mt-2">
                All data transfers between your device and Supabase are encrypted in transit using SSL/TLS security protocols.
              </p>
            </section>

            {/* Data Security */}
            <section>
              <h3 className="font-semibold text-base mb-2">8. Data Security</h3>
              <p className="text-gray-700 mb-2">We implement the following security measures:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Encryption:</strong> All data transmitted between your device and our servers uses industry-standard SSL/TLS encryption</li>
                <li><strong>Access Control:</strong> Role-based permissions limit who can view, edit, or delete data (Cadet, Point Giver, SNCO, Staff roles)</li>
                <li><strong>Authentication:</strong> Secure login system with email/password authentication managed by Supabase (staff and NCOs only)</li>
                <li><strong>Admin Verification:</strong> Additional 4-digit PIN verification required for sensitive administrative functions</li>
                <li><strong>File Sanitization:</strong> Uploaded file names are automatically sanitized to prevent security vulnerabilities</li>
                <li><strong>Automatic Expiry:</strong> Join codes and temporary access tokens expire automatically after configured durations</li>
                <li><strong>Data Integrity Checks:</strong> Automated validation ensures points reference valid cadets and data consistency</li>
              </ul>
              <p className="text-gray-700 mt-2">
                While we implement industry-standard security measures, no system is completely secure. Please use a strong password and keep your login credentials confidential.  Cadets using the system without accounts should not share any personal information beyond what is required. 
              </p>
            </section>

            {/* Data Retention */}
            <section>
              <h3 className="font-semibold text-base mb-2">9. Data Retention</h3>
              <p className="text-gray-700 mb-2">We retain your personal data as follows:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>General Data:</strong> Data is retained for a maximum of 4 years, after which it is deleted from Supabase</li>
                <li><strong>Periodic Resets:</strong> The database may be reset at the end of academic years or as operationally required, removing older data</li>
                <li><strong>Uploaded Evidence Files:</strong> Stored for the duration of the ticket lifecycle; deleted when tickets are resolved or during periodic resets</li>
                <li><strong>User Accounts:</strong> Staff and SNCO accounts remain active until manually deleted by administrators</li>
                <li><strong>Notification Data:</strong> Retained for the duration of system use; removed during periodic resets</li>
                <li><strong>Browser Cache:</strong> Persists in your browser until you manually clear it or the browser automatically clears it based on your settings</li>
                <li><strong>Join Codes:</strong> Automatically expire after their configured duration (minimum 1 minute, typically 1 hour)</li>
                <li><strong>CSV Exports:</strong> Once downloaded to a user's device, we have no control over retention - users should delete files when no longer needed</li>
              </ul>
              <p className="text-gray-700 mt-2">
                Data may be retained longer if required by RAF Air Cadets regulations or legal obligations.  Cadets or parents/guardians may request early deletion of data by contacting the Squadron Data Protection Contact. 
              </p>
            </section>

            {/* Data Sharing */}
            <section>
              <h3 className="font-semibold text-base mb-2">10. Who We Share Your Data With</h3>
              <p className="text-gray-700 mb-2">
                Your personal data is shared <strong>only within 2427 (Biggin Hill) Squadron</strong> as follows:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Cadets:</strong> Can view leaderboards (all cadets' points and flights), their own points history, and submit tickets</li>
                <li><strong>Point Givers:</strong> Can view all cadet data, award points, record attendance, and download CSV exports</li>
                <li><strong>SNCOs:</strong> Full access to manage cadets, points, attendance, and tickets</li>
                <li><strong>Staff:</strong> Full administrative access to all system functions and data</li>
              </ul>
              <p className="text-gray-700 mt-2">
                <strong>We do NOT share your data with:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li>Other RAF Air Cadet squadrons</li>
                <li>Wing or regional headquarters</li>
                <li>RAF Air Cadets central administration</li>
                <li>Third-party marketing or analytics companies</li>
                <li>Any external organizations</li>
              </ul>
              <p className="text-gray-700 mt-2">
                The only third-party services that process data are our technical infrastructure providers (Supabase for hosting, GitGub Pages for application hosting) who act as data processors under our instructions and appropriate contracts.
              </p>
            </section>

            {/* Your Rights */}
            <section>
              <h3 className="font-semibold text-base mb-2">11. Your Data Protection Rights</h3>
              <p className="text-gray-700 mb-2">Under UK GDPR, you have the following rights:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Right to Access:</strong> Request a copy of the personal data we hold about you</li>
                <li><strong>Right to Rectification:</strong> Request correction of inaccurate or incomplete data (e.g., name corrections via the system)</li>
                <li><strong>Right to Erasure:</strong> Request deletion of your personal data (subject to legitimate operational requirements)</li>
                <li><strong>Right to Restrict Processing:</strong> Request we limit how we use your data</li>
                <li><strong>Right to Data Portability:</strong> Request transfer of your data in a machine-readable format (CSV export available)</li>
                <li><strong>Right to Object:</strong> Object to processing based on legitimate interests</li>
              </ul>
              <p className="text-gray-700 mt-2">
                To exercise any of these rights, please contact the Squadron Data Protection Contact (details in Section 2). We will respond within one month. 
              </p>
            </section>

            {/* Cookies & Tracking */}
            <section>
              <h3 className="font-semibold text-base mb-2">12. Cookies & Tracking</h3>
              <p className="text-gray-700 mb-2">
                This application uses browser storage technologies to function properly: 
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Session Storage:</strong> Maintains your login session and temporary admin PIN verification status</li>
                <li><strong>Local Storage:</strong> Caches squadron data for offline access, stores file metadata indexes, and UI preferences</li>
                <li><strong>Authentication Cookies:</strong> Supabase may set necessary authentication cookies for login sessions</li>
              </ul>
              <p className="text-gray-700 mt-2">
                <strong>We do NOT use: </strong> Analytics cookies, advertising cookies, social media tracking pixels, or third-party tracking scripts for marketing purposes.
              </p>
            </section>

            {/* Third Party Services */}
            <section>
              <h3 className="font-semibold text-base mb-2">13. Third-Party Services</h3>
              <p className="text-gray-700 mb-2">We use the following third-party services to operate this system:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Supabase (supabase.com):</strong> Cloud database, authentication, and file storage - GDPR-compliant infrastructure</li>
                <li><strong>GitHub Pages:</strong> Application hosting and deployment platform</li>
              </ul>
              <p className="text-gray-700 mt-2">
                Each service has its own privacy policy and security practices. We select vendors that comply with UK GDPR and data protection regulations.  Data processing agreements are in place where required.
              </p>
            </section>

            {/* Changes to Policy */}
            <section>
              <h3 className="font-semibold text-base mb-2">14. Changes to This Policy</h3>
              <p className="text-gray-700">
                We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. Changes will be posted on this page with an updated "Last Updated" date.  Significant changes will be communicated to users via the notification system or at squadron parades.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h3 className="font-semibold text-base mb-2">15. Contact Us</h3>
              <p className="text-gray-700 mb-2">
                For privacy concerns, questions about this policy, or to exercise your data protection rights, contact: 
              </p>
              <p className="text-gray-700 ml-2">
                <strong>Squadron Data Protection Contact:</strong> Sgt Jack Penny<br />
                <em>(Email address to be provided following CO approval)</em>
              </p>
              <p className="text-gray-700 mt-2">
                Alternatively, speak to any staff member or SNCO at squadron parades.
              </p>
            </section>

            {/* Right to Complain */}
            <section>
              <h3 className="font-semibold text-base mb-2">16. Right to Complain</h3>
              <p className="text-gray-700">
                If you are unhappy with how we have handled your personal data, you have the right to complain to the Information Commissioner's Office (ICO):
              </p>
              <p className="text-gray-700 ml-2 mt-2">
                <strong>ICO Website:</strong> <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">ico.org.uk</a><br />
                <strong>ICO Helpline:</strong> 0303 123 1113
              </p>
            </section>

          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50">
          <Button onClick={() => setOpen(false)} className="w-full">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
