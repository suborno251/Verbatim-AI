import { ContractDocument, ChatMessage } from '../types';
import { extractContractSections } from '../extraction/sections';

/**
 * Server-side singleton document & conversation store.
 * Supports in-memory cache and stores documents for single-user workflow.
 */
class DocumentStore {
  private documents: Map<string, ContractDocument> = new Map();
  private rawBuffers: Map<string, Buffer> = new Map();
  private chatHistories: Map<string, ChatMessage[]> = new Map();

  constructor() {
    this.seedInitialSampleDoc();
  }

  public getAll(): ContractDocument[] {
    return Array.from(this.documents.values()).sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  }

  public get(id: string): ContractDocument | undefined {
    return this.documents.get(id);
  }

  public save(doc: ContractDocument, rawBuffer?: Buffer): void {
    this.documents.set(doc.id, doc);
    if (rawBuffer) {
      this.rawBuffers.set(doc.id, rawBuffer);
    }
  }

  public delete(id: string): boolean {
    this.rawBuffers.delete(id);
    this.chatHistories.delete(id);
    return this.documents.delete(id);
  }

  public getRawBuffer(id: string): Buffer | undefined {
    return this.rawBuffers.get(id);
  }

  public getChatHistory(docId: string): ChatMessage[] {
    return this.chatHistories.get(docId) || [];
  }

  public saveChatHistory(docId: string, messages: ChatMessage[]): void {
    this.chatHistories.set(docId, messages);
  }

  public addChatMessage(docId: string, message: ChatMessage): void {
    const history = this.chatHistories.get(docId) || [];
    history.push(message);
    this.chatHistories.set(docId, history);
  }

  public clearChatHistory(docId: string): void {
    this.chatHistories.delete(docId);
  }

  private seedInitialSampleDoc(): void {
    const sampleId1 = 'sample-master-services-agreement';
    const sampleDoc1: ContractDocument = {
      id: sampleId1,
      name: 'Sample_Master_Services_Agreement_v1.pdf',
      fileType: 'pdf',
      fileSize: 48200,
      pageCount: 3,
      uploadedAt: new Date(Date.now() - 86400000).toISOString(),
      pages: [
        {
          pageNumber: 1,
          charCount: 1420,
          wordCount: 220,
          text: `MASTER SERVICES AGREEMENT\n\nThis Master Services Agreement ("Agreement") is entered into on January 15, 2024, by and between Apex Global Solutions LLC ("Client") and NovaTech Digital Systems FZ-LLC ("Service Provider").\n\n1. SCOPE OF SERVICES\nService Provider shall provide cloud infrastructure development, maintenance, and cybersecurity auditing services as detailed in applicable Statements of Work ("SOW").\n\n2. TERM AND TERMINATION\n2.1 Term. This Agreement commences on the Effective Date and continues for a period of twenty-four (24) months unless terminated earlier in accordance with this Section 2.\n2.2 Termination for Convenience. Either party may terminate this Agreement or any Statement of Work without cause upon giving sixty (60) days prior written notice to the other party.\n2.3 Termination for Cause. Either party may terminate immediately upon written notice if the other party breaches any material term and fails to cure such breach within thirty (30) days of receipt of written notification.`,
        },
        {
          pageNumber: 2,
          charCount: 1580,
          wordCount: 245,
          text: `3. FEES AND PAYMENT TERMS\nClient shall pay all undisputed invoices within thirty (30) calendar days from receipt of invoice. Late payments shall incur interest at the rate of 1.5% per month or the maximum rate permitted under applicable law, whichever is lower.\n\n4. LIMITATION OF LIABILITY\n4.1 Consequential Damages Waiver. Except for breaches of Section 5 (Confidentiality) or indemnification obligations under Section 6, neither party shall be liable for indirect, incidental, punitive, or exemplary damages.\n4.2 Aggregate Liability Cap. In no event shall either party's aggregate liability arising out of or related to this Agreement exceed the total fees paid or payable by Client to Service Provider under the applicable SOW in the preceding twelve (12) months, or AED 500,000, whichever is less.`,
        },
        {
          pageNumber: 3,
          charCount: 1390,
          wordCount: 215,
          text: `5. CONFIDENTIALITY\nEach party agrees to safeguard the Confidential Information of the other party with the same degree of care it uses for its own confidential assets, but not less than reasonable care. These confidentiality obligations shall survive termination for five (5) years.\n\n6. INDEMNIFICATION\nService Provider shall defend and indemnify Client, its officers, directors, and employees from and against any third-party claims, damages, liabilities, and expenses arising out of any infringement of intellectual property rights by the deliverables provided hereunder.\n\n7. GOVERNING LAW AND DISPUTE RESOLUTION\nThis Agreement shall be governed by and construed in accordance with the laws of the Dubai International Financial Centre (DIFC). Any dispute shall be settled by arbitration seated in the DIFC-LCIA Arbitration Centre.`,
        },
      ],
      fullText: '',
      isScanned: false,
    };

    sampleDoc1.fullText = sampleDoc1.pages.map((p) => `--- PAGE ${p.pageNumber} ---\n${p.text}`).join('\n\n');
    sampleDoc1.sections = extractContractSections(sampleDoc1.pages);
    this.documents.set(sampleId1, sampleDoc1);

    // Seed Version 2 (Revised agreement for instant multi-doc analysis and clause diff comparison)
    const sampleId2 = 'sample-master-services-agreement-v2';
    const sampleDoc2: ContractDocument = {
      id: sampleId2,
      name: 'Sample_Master_Services_Agreement_v2_Revised.docx',
      fileType: 'docx',
      fileSize: 52400,
      pageCount: 3,
      uploadedAt: new Date().toISOString(),
      pages: [
        {
          pageNumber: 1,
          charCount: 1450,
          wordCount: 225,
          text: `MASTER SERVICES AGREEMENT (REVISED)\n\nThis Master Services Agreement ("Agreement") is amended and restated on March 1, 2024, by and between Apex Global Solutions LLC ("Client") and NovaTech Digital Systems FZ-LLC ("Service Provider").\n\n1. SCOPE OF SERVICES\nService Provider shall provide cloud infrastructure development, enterprise AI migration, and continuous cybersecurity auditing services as detailed in applicable Statements of Work ("SOW").\n\n2. TERM AND TERMINATION\n2.1 Term. This Agreement commences on the Effective Date and continues for a period of thirty-six (36) months unless terminated earlier in accordance with this Section 2.\n2.2 Termination for Convenience. Either party may terminate this Agreement or any Statement of Work without cause upon giving thirty (30) days prior written notice to the other party.\n2.3 Termination for Cause. Either party may terminate immediately upon written notice if the other party breaches any material term and fails to cure such breach within fifteen (15) days of receipt of written notification.`,
        },
        {
          pageNumber: 2,
          charCount: 1620,
          wordCount: 250,
          text: `3. FEES AND PAYMENT TERMS\nClient shall pay all undisputed invoices within forty-five (45) calendar days from receipt of invoice. Late payments shall incur interest at the rate of 1.0% per month or the maximum rate permitted under applicable law, whichever is lower.\n\n4. LIMITATION OF LIABILITY\n4.1 Consequential Damages Waiver. Except for breaches of Section 5 (Confidentiality), gross negligence, or indemnification obligations under Section 6, neither party shall be liable for indirect, incidental, punitive, or exemplary damages.\n4.2 Aggregate Liability Cap. In no event shall either party's aggregate liability arising out of or related to this Agreement exceed the total fees paid or payable by Client to Service Provider under the applicable SOW in the preceding twelve (12) months, or AED 1,000,000, whichever is greater.`,
        },
        {
          pageNumber: 3,
          charCount: 1540,
          wordCount: 235,
          text: `5. CONFIDENTIALITY\nEach party agrees to safeguard the Confidential Information of the other party with the same degree of care it uses for its own confidential assets, but not less than reasonable care. These confidentiality obligations shall survive termination indefinitely.\n\n6. INDEMNIFICATION\nEach party ("Indemnifying Party") shall defend and indemnify the other party, its officers, directors, and employees from and against any third-party claims, damages, liabilities, and expenses arising out of any material breach of this Agreement or infringement of intellectual property rights.\n\n7. GOVERNING LAW AND DISPUTE RESOLUTION\nThis Agreement shall be governed by and construed in accordance with the laws of the Abu Dhabi Global Market (ADGM). Any dispute shall be settled by the ADGM Courts.\n\n8. NON-SOLICITATION\nNeither party shall actively solicit or hire any employee of the other party during the term of this Agreement and for a period of twelve (12) months thereafter without prior written consent.`,
        },
      ],
      fullText: '',
      isScanned: false,
    };

    sampleDoc2.fullText = sampleDoc2.pages.map((p) => `--- PAGE ${p.pageNumber} ---\n${p.text}`).join('\n\n');
    sampleDoc2.sections = extractContractSections(sampleDoc2.pages);
    this.documents.set(sampleId2, sampleDoc2);
  }
}

const globalForStore = globalThis as unknown as { documentStore?: DocumentStore };
export const documentStore = globalForStore.documentStore || new DocumentStore();
if (process.env.NODE_ENV !== 'production') globalForStore.documentStore = documentStore;
