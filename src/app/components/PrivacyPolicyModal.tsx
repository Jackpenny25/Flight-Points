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
            </section>

            {/* Data Controller */}
            <section>
              <h3 className="font-semibold text-base mb-2">2. Who We Are</h3>
              <p className="text-gray-700">
                2427 (Biggin Hill) Squadron RAF Air Cadets is the data controller for personal information collected through this website.
              </p>
              <p className="text-gray-700 mt-2">
                <strong>Squadron Data Protection Contact:</strong> Sgt Jack Penny
              </p>
              <p className="text-gray-700 mt-1">
                <em>Provide an email address to include here (optional).</em>
              </p>
            </section>

            {/* Data Collection */}
            <section>
              <h3 className="font-semibold text-base mb-2">3. What Personal Data We Collect</h3>
              <p className="text-gray-700 mb-2">We collect the following personal data:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Names</strong> - Full name of cadets and staff</li>
                <li><strong>Email addresses</strong> - For account access and notifications</li>
                <li><strong>Role information</strong> - Cadet, Point Giver, SNCO, or Staff designation</li>
                <li><strong>Flight assignments</strong> - Which flight (1, 2, 3, or 4) you belong to</li>
                <li><strong>Attendance records</strong> - Dates and times of attendance at squadron activities</li>
                <li><strong>Points/Awards data</strong> - Flight points earned and achievements</li>
                <li><strong>User IDs</strong> - Unique identifiers for system management</li>
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
                <li><strong>Legitimate interests:</strong> Managing squadron activities, attendance, and points for the effective operation of 2427 Squadron</li>
                <li><strong>Legal obligation:</strong> Compliance with RAF Air Cadets and MOD regulatory requirements where applicable</li>
              </ul>
              <p className="text-gray-700 mt-2">We do not rely on consent or contractual necessity as the primary legal bases for routine processing in this system.</p>
            </section>

            {/* Parental / Guardian information */}
            <section>
              <h3 className="font-semibold text-base mb-2">5. Parental/Guardian Information (For Minors)</h3>
              <p className="text-gray-700">
                Where cadets are under 18, parents or guardians may raise any concerns about how their child's personal data is processed. Personal data relating to minors is processed as part of RAF Air Cadets activities and under RAFAC governance. If you have concerns, please contact the Squadron Data Protection Contact.
              </p>
            </section>

            {/* Data Usage */}
            <section>
              <h3 className="font-semibold text-base mb-2">6. How We Use Your Data</h3>
              <p className="text-gray-700 mb-2">Your personal data is used for:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li>Managing cadet accounts and authentication</li>
                <li>Tracking attendance at squadron activities</li>
                <li>Recording and managing flight points and achievements</li>
                <li>Producing leaderboards and performance reports (leaderboards are only visible to authorised squadron members)</li>
                <li>Communications about squadron activities</li>
                <li>Ensuring data integrity and system security</li>
              </ul>
            </section>

            {/* Data Storage */}
            <section>
              <h3 className="font-semibold text-base mb-2">7. Where Your Data Is Stored</h3>
              <p className="text-gray-700 mb-2">
                Personal data is stored primarily in Supabase (cloud). Supabase provides GDPR-aligned hosting and appropriate safeguards for data held on its infrastructure.
              </p>
              <p className="text-gray-700 mb-2">
                The application previously used local JSON files for offline or backup purposes which were stored on an administrator's personal device. Those repository files have now been removed and any personal data held locally should likewise be deleted or transferred to the Supabase backend as soon as possible.
              </p>
              <p className="text-gray-700 mb-2">
                If there is a need to temporarily store operational backups locally in future, they must be:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li>Stored on a squadron-managed device with full disk encryption</li>
                <li>Protected by a device password and limited to authorised personnel</li>
                <li>Deleted as soon as the data is transferred to Supabase or no longer needed</li>
              </ul>
              <p className="text-gray-700 mt-2">
                All data transfers are encrypted in transit using SSL/TLS security protocols.
              </p>
            </section>

            {/* Data Security */}
            <section>
              <h3 className="font-semibold text-base mb-2">8. Data Security</h3>
              <p className="text-gray-700">
                We implement appropriate technical and organisational security measures to protect your personal data, including:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li>Encrypted authentication through Supabase</li>
                <li>Role-based access controls (staff, SNCOs, point givers only)</li>
                <li>PIN protection for administrative functions</li>
                <li>Secure data storage and restricted access to authorised personnel</li>
                <li>Access logging and audit records for administrative actions and retention runs</li>
              </ul>
            </section>

            {/* Data Retention */}
            <section>
              <h3 className="font-semibold text-base mb-2">9. How Long We Keep Your Data</h3>
              <p className="text-gray-700 mb-2">
                Personal data is retained only as long as necessary. We automatically delete personal records four years after their creation, or earlier if you request deletion. If you would prefer the retention period to be measured from the date a cadet leaves the squadron instead, please contact the Squadron Data Protection Contact and we can align our processes accordingly.
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li>Personal records (cadet profiles, attendance, points, tickets, notifications) are deleted after 4 years from creation unless otherwise agreed</li>
                <li>If you request deletion, we will delete your personal data and associated records as soon as possible (normally within 30 days), subject to any statutory or regulatory retention obligations</li>
                <li>Where specific RAF Air Cadets rules require longer retention, those records will be handled in accordance with those rules and retained only for the required period</li>
              </ul>
            </section>

            {/* Your Rights */}
            <section>
              <h3 className="font-semibold text-base mb-2">10. Your Data Protection Rights</h3>
              <p className="text-gray-700 mb-2">Under UK Data Protection law, you have the right to:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li><strong>Access</strong> - Request a copy of your personal data</li>
                <li><strong>Rectification</strong> - Ask us to correct inaccurate data</li>
                <li><strong>Erasure</strong> - Request deletion of your data (subject to retention obligations)</li>
                <li><strong>Restrict processing</strong> - Limit how we use your data</li>
                <li><strong>Portability</strong> - Receive your data in a portable format</li>
                <li><strong>Object</strong> - Oppose processing of your data for certain purposes</li>
              </ul>
              <p className="text-gray-700 mt-2">
                To exercise these rights, contact the Squadron Data Protection Contact: Sgt Jack Penny.
              </p>
            </section>

            {/* Data Sharing */}
            <section>
              <h3 className="font-semibold text-base mb-2">11. Who We Share Your Data With</h3>
              <p className="text-gray-700 mb-2">
                Your personal data is only shared with:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                <li>RAF Air Cadets national leadership (for regulatory compliance)</li>
                <li>Staff and SNCOs within 2427 Squadron (for management purposes)</li>
                <li>Supabase (cloud provider) - for authentication and backup. Supabase stores data in GDPR-aligned data centres and uses industry-standard safeguards.</li>
              </ul>
              <p className="text-gray-700 mt-2">
                We do not sell or commercially exploit your personal data.
              </p>
            </section>

            {/* Cookies */}
            <section>
              <h3 className="font-semibold text-base mb-2">12. Cookies & Tracking</h3>
              <p className="text-gray-700">
                This application uses session storage and browser storage to maintain your login session. No tracking cookies are used for analytics or marketing purposes.
              </p>
            </section>

            {/* Changes to Policy */}
            <section>
              <h3 className="font-semibold text-base mb-2">13. Changes to This Policy</h3>
              <p className="text-gray-700">
                We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date. We will notify users of significant changes where appropriate.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h3 className="font-semibold text-base mb-2">14. Contact Us</h3>
              <p className="text-gray-700 mb-2">
                For privacy concerns or to exercise your data protection rights, contact the Squadron Data Protection Contact:
              </p>
              <p className="text-gray-700">
                <strong>Squadron Data Protection Contact:</strong> Sgt Jack Penny<br />
                2427 (Biggin Hill) Squadron RAF Air Cadets
              </p>
              <p className="text-gray-700 mt-2">
                <em>Provide an email address to display here (optional).</em>
              </p>
            </section>

            {/* Last Updated */}
            <section className="border-t pt-4">
              <p className="text-xs text-gray-500">
                Last Updated: December 29, 2025
              </p>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
