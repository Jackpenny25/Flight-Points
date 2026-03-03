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
          <DialogDescription>Flight Points System</DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6 text-sm pb-6">
            {/* Introduction */}
            <section>
              <h3 className="font-semibold text-base mb-2">1. Introduction</h3>
              <p className="text-gray-700">
                Flight Points is committed to protecting your personal data and respecting your privacy. This Privacy Policy explains how we collect, use, and protect personal information in accordance with the UK GDPR and the Data Protection Act 2018 and other applicable privacy laws.
              </p>
              <p className="text-gray-700 mt-2">
                <strong>Last Updated:</strong> March 2026
              </p>
            </section>

            {/* Data Controller */}
            <section>
              <h3 className="font-semibold text-base mb-2">2. Who We Are</h3>
              <p className="text-gray-700">
                Flight Points is the data controller for personal information collected through this system. 
              </p>
              <p className="text-gray-700 mt-2">
                <strong>Data Protection Contact:</strong> Admin
              </p>
              <p className="text-gray-700 mt-1">
                <strong>Email:</strong>{' '}
                <a href="mailto:help@flightpoints.uk" className="text-blue-600 underline">help@flightpoints.uk</a>
              </p>
            </section>

            {/* Data Collection */}
            <section>
              <h3 className="font-semibold text-base mb-2">3. What Personal Data We Collect</h3>
              <p className="text-gray-700 mb-2">We collect the following personal data:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Names</strong> - Full name of cadets and staff (format:  Surname Initial)</li>
                <li><strong>Usernames / Login Credentials</strong> - Used for account login (accounts created by administrators for staff, NCOs, and cadets as needed)</li>
                <li><strong>Role information</strong> - Cadet, Point Giver, Flight Point Lead, or Staff designation</li>
                <li><strong>Flight assignments</strong> - Which flight (1, 2, 3, or 4) you belong to</li>
                <li><strong>Attendance records</strong> - Dates, times, and status (present/absent) at squadron activities</li>
                <li><strong>Points/Awards data</strong> - Flight points earned, achievements, reasons, and who awarded them</li>
                <li><strong>User IDs</strong> - Unique identifiers for system management</li>
                <li><strong>Uploaded Evidence Files</strong> - Images and documents uploaded to support achievement ticket requests</li>
                <li><strong>Notification Data</strong> - Records of notifications sent regarding points, attendance, and ticket updates</li>
                <li><strong>Request/Ticket Data</strong> - Information about achievements submitted for review, including descriptions, categories, requested points, and approval status</li>
                <li><strong>User Activity Metadata</strong> - Information about who submitted data (e.g., "given by," "submitted by" fields) and timestamps of actions</li>
                <li><strong>Reward Suggestions & Votes</strong> - Reward ideas submitted by users and voting records</li>
                <li><strong>Account Links</strong> - Cadet account linking records that connect login accounts to cadet profiles for personal point and attendance tracking</li>
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
                <li><strong>Legitimate interests: </strong> Managing activities, tracking attendance, and awarding flight points for the effective operation of this system</li>
                <li><strong>Legal obligation:</strong> Compliance with applicable UK data protection and safeguarding requirements where relevant</li>
              </ul>
              <p className="text-gray-700 mt-2">
                <em>Note: Parental consent requirements for users under 16 are reviewed as part of local policy and legal compliance updates.</em>
              </p>
            </section>

            {/* How We Collect Data */}
            <section>
              <h3 className="font-semibold text-base mb-2">5. How We Collect Your Data</h3>
              <p className="text-gray-700 mb-2">We collect personal data through:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Account Registration</strong> - Accounts are created by Flight Point Lead administrators (self-signup is not available). Staff, NCOs, and cadets may be issued accounts. Cadet accounts are linked to their cadet profile to enable personal point and attendance tracking.</li>
                <li><strong>Direct Input</strong> - Points, attendance, and cadet information entered by authorized staff, Flight Point Leads, and Point Givers</li>
                <li><strong>File Uploads</strong> - Images and documents you voluntarily upload as evidence for achievement ticket requests</li>

                <li><strong>Automated Processes</strong> - System-generated IDs, timestamps, bulk operation tracking, and attendance points</li>
              </ul>
            </section>

            {/* How We Use Data */}
            <section>
              <h3 className="font-semibold text-base mb-2">6. How We Use Your Data</h3>
              <p className="text-gray-700 mb-2">We use your personal data for the following purposes:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li>Managing cadet accounts and flight assignments</li>
                <li>Tracking attendance at organisation activities and awarding attendance points</li>
                <li>Recording and managing flight points and achievements</li>
                <li>Processing achievement tickets submitted by cadets</li>
                <li>Producing leaderboards and performance reports (visible only to authorised system users)</li>
                <li>Sending notifications about points awarded, attendance, and ticket status updates</li>
                <li>Ensuring data integrity and system security through integrity checks</li>
              </ul>
            </section>

            {/* Data Storage */}
            <section>
              <h3 className="font-semibold text-base mb-2">7. Where Your Data Is Stored</h3>
              
              <p className="text-gray-700 mb-2">
                <strong>All data is stored entirely on our own server.</strong> We do not use any third-party cloud databases or external storage services. Your personal data never leaves our infrastructure.
              </p>

              <p className="text-gray-700 mb-2">
                <strong>Our Server (PostgreSQL Database):</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2 mb-3">
                <li><strong>Database: </strong> All cadet, points, attendance, ticket, reward, and account data is stored in a PostgreSQL database hosted directly on our own server — not in any external cloud service</li>
                <li><strong>File Storage:</strong> Uploaded evidence files (images/documents) are stored on the same server with controlled access</li>
                <li><strong>Authentication:</strong> User accounts, passwords, and login sessions are all managed on our server</li>
                <li><strong>Backups:</strong> Database backups are performed locally on the server and are not sent to any external service</li>
                <li>Our server infrastructure includes appropriate security safeguards aligned with GDPR principles</li>
              </ul>

              <p className="text-gray-700 mb-2">
                <strong>Browser Storage (Your Device Only):</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2 mb-3">
                <li><strong>localStorage:</strong> Caches cadet data, points, and attendance for offline access and faster performance.  Also stores file metadata indexes and UI preferences.  This data never leaves your device.</li>
                <li><strong>sessionStorage:</strong> Stores temporary admin PIN verification status and UI state (automatically cleared when browser closes)</li>
                <li>You can clear browser storage at any time through your browser settings without affecting the central database</li>
              </ul>

              <p className="text-gray-700 mt-3">
                <strong>Important:</strong> All data is stored on our own server. Data is <strong>not</strong> stored in source control repositories, third-party cloud platforms, or external databases. The only copy outside our server is the temporary cache in your own web browser.
              </p>
              
              <p className="text-gray-700 mt-2">
                All data transfers between your device and our services are encrypted in transit using SSL/TLS security protocols.
              </p>
            </section>

            {/* Data Security */}
            <section>
              <h3 className="font-semibold text-base mb-2">8. Data Security</h3>
              <p className="text-gray-700 mb-2">We implement the following security measures:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Encryption:</strong> All data transmitted between your device and our servers uses industry-standard SSL/TLS encryption</li>
                <li><strong>Access Control:</strong> Role-based permissions limit who can view, edit, or delete data (Cadet, Point Giver, Flight Point Lead, Staff roles)</li>
                <li><strong>Authentication:</strong> Secure login system with username/password authentication managed by our server</li>
                <li><strong>Admin Verification:</strong> Additional 6-digit PIN verification required for sensitive administrative functions</li>
                <li><strong>File Sanitization:</strong> Uploaded file names are automatically sanitized to prevent security vulnerabilities</li>
                <li><strong>Automatic Expiry:</strong> Temporary access tokens and session credentials expire automatically</li>
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
                <li><strong>General Data:</strong> Data is retained for a maximum of 4 years, after which it is deleted from the production database</li>
                <li><strong>Periodic Resets:</strong> The database may be reset at the end of academic years or as operationally required, removing older data</li>
                <li><strong>Uploaded Evidence Files:</strong> Stored for the duration of the ticket lifecycle; deleted when tickets are resolved or during periodic resets</li>
                <li><strong>User Accounts:</strong> All user accounts (staff, NCOs, cadets) remain active until manually deleted by administrators</li>
                <li><strong>Notification Data:</strong> Retained for the duration of system use; removed during periodic resets</li>
                <li><strong>Browser Cache:</strong> Persists in your browser until you manually clear it or the browser automatically clears it based on your settings</li>
              </ul>
              <p className="text-gray-700 mt-2">
                Data may be retained longer if required by applicable law or legal obligations. Cadets or parents/guardians may request early deletion of data by contacting the Data Protection Contact.
              </p>
            </section>

            {/* Data Sharing */}
            <section>
              <h3 className="font-semibold text-base mb-2">10. Who We Share Your Data With</h3>
              <p className="text-gray-700 mb-2">
                Your personal data is shared <strong>only with authorised users of this system</strong> as follows:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Cadets:</strong> Can view leaderboards (all cadets' points and flights), their own points history, their own attendance records, submit tickets, and participate in rewards</li>
                <li><strong>Point Givers:</strong> Can view cadet data, award points to their own flight, and record attendance</li>
                <li><strong>Flight Point Leads:</strong> Full access to manage cadets, points, attendance, tickets, and accounts</li>
                <li><strong>Staff:</strong> Can award points to any flight; no attendance or administrative access</li>
              </ul>
              <p className="text-gray-700 mt-2">
                <strong>We do NOT share your data with:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li>Other external organisations by default</li>
                <li>Third-party analytics networks for marketing</li>
                <li>Third-party marketing or analytics companies</li>
                <li>Any external organisations unless required by law</li>
              </ul>
              <p className="text-gray-700 mt-2">
                Third-party services that process data are limited to technical infrastructure providers (such as server/network providers used to run this service) acting under our instructions and applicable data protection controls.
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
                <li><strong>Right to Data Portability:</strong> Request transfer of your data in a machine-readable format</li>
                <li><strong>Right to Object:</strong> Object to processing based on legitimate interests</li>
              </ul>
              <p className="text-gray-700 mt-2">
                To exercise any of these rights, please contact the Data Protection Contact (details in Section 2). We will respond within one month.
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
                <li><strong>Local Storage:</strong> Caches application data for offline access, stores file metadata indexes, and UI preferences</li>
                <li><strong>Authentication Cookies:</strong> Our authentication system may set necessary cookies or tokens for login sessions</li>
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
                <li><strong>Server/Infrastructure Providers:</strong> Services used for application hosting, database hosting, backups, and operations</li>
                <li><strong>Network Access Providers (if enabled):</strong> Services used to securely route traffic to internal systems</li>
              </ul>
              <p className="text-gray-700 mt-2">
                Each service has its own privacy policy and security practices. We select vendors that comply with UK GDPR and data protection regulations.  Data processing agreements are in place where required.
              </p>
            </section>

            {/* Changes to Policy */}
            <section>
              <h3 className="font-semibold text-base mb-2">14. Changes to This Policy</h3>
              <p className="text-gray-700">
                We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. Changes will be posted on this page with an updated "Last Updated" date. Significant changes will be communicated to users via the notification system or other appropriate channels.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h3 className="font-semibold text-base mb-2">15. Contact Us</h3>
              <p className="text-gray-700 mb-2">
                For privacy concerns, questions about this policy, or to exercise your data protection rights, contact: 
              </p>
              <p className="text-gray-700 ml-2">
                <strong>Data Protection Contact:</strong> Admin<br />
                <strong>Email:</strong>{' '}
                <a href="mailto:help@flightpoints.uk" className="text-blue-600 underline">help@flightpoints.uk</a>
              </p>
              <p className="text-gray-700 mt-2">
                Alternatively, speak to any authorized administrator.
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
