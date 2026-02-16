type WalletImageModule = {
  id: string;
  mainImage: {
    sourceUri: { uri: string };
  };
};

type WalletTextModule = {
  id: string;
  header?: string;
  body: string;
};

export const walletClassTemplateOverride = {
  cardRowTemplateInfos: [
    {
      oneItem: {
        item: {
          firstValue: {
            fields: [
              {
                fieldPath: "object.imageModulesData['stampGrid'].mainImage",
              },
            ],
          },
        },
      },
    },
    {
      twoItems: {
        startItem: {
          firstValue: {
            fields: [
              {
                fieldPath: "object.textModulesData['stamps'].body",
              },
            ],
          },
        },
        endItem: {
          firstValue: {
            fields: [
              {
                fieldPath: "object.textModulesData['rewards'].body",
              },
            ],
          },
        },
      },
    },
  ],
} as const;

export function buildStampImageModule(imageUrl: string): WalletImageModule {
  return {
    id: "stampGrid",
    mainImage: {
      sourceUri: { uri: imageUrl },
    },
  };
}

export function buildStampTextModules(params: {
  stampCount: number;
  maxPoints: number;
  rewards: number;
  customerEmail?: string;
}): WalletTextModule[] {
  const modules: WalletTextModule[] = [
    {
      id: "stamps",
      header: "",
      body: `Stamps ${params.stampCount}/${params.maxPoints}`,
    },
    {
      id: "rewards",
      header: "",
      body: `Rewards ${params.rewards}`,
    },
  ];

  if (params.customerEmail) {
    modules.push({
      id: "customer",
      header: "Customer",
      body: params.customerEmail,
    });
  }

  return modules;
}

export function buildLoyaltyClassPayload(params: {
  classId: string;
  issuerName: string;
  programName: string;
  programLogoUrl: string;
  accountIdLabel: string;
  accountNameLabel: string;
  reviewStatus: "underReview" | "approved" | "rejected";
  locations?: Array<{ latitude: number; longitude: number }>;
  websiteUrl?: string;
  hexBackgroundColor?: string;
}) {
  // Keep programName non-empty (Google requires it), but visually minimal.
  const hiddenProgramName = "\u00A0";

  return {
    id: params.classId,
    issuerName: params.issuerName,
    programName: hiddenProgramName,
    programLogo: {
      sourceUri: { uri: params.programLogoUrl },
    },
    ...(params.hexBackgroundColor
      ? { hexBackgroundColor: params.hexBackgroundColor }
      : {}),
    ...(params.locations && params.locations.length > 0
      ? { locations: params.locations }
      : {}),
    ...(params.websiteUrl
      ? {
          linksModuleData: {
            uris: [
              {
                uri: params.websiteUrl,
                description: "Website",
              },
            ],
          },
        }
      : {}),
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: walletClassTemplateOverride.cardRowTemplateInfos,
      },
    },
    accountIdLabel: params.accountIdLabel,
    accountNameLabel: params.accountNameLabel,
    reviewStatus: params.reviewStatus,
  };
}

export function buildLoyaltyObjectPayload(params: {
  objectId: string;
  classId: string;
  state: "ACTIVE" | "INACTIVE";
  accountId: string;
  accountName: string;
  barcodeValue: string;
  barcodeAltText?: string;
  imageUrl: string;
  stampCount: number;
  maxPoints: number;
  rewards: number;
  customerEmail?: string;
}) {
  return {
    id: params.objectId,
    classId: params.classId,
    state: params.state,
    accountId: params.accountId,
    accountName: params.accountName,
    imageModulesData: [buildStampImageModule(params.imageUrl)],
    textModulesData: buildStampTextModules({
      stampCount: params.stampCount,
      maxPoints: params.maxPoints,
      rewards: params.rewards,
      customerEmail: params.customerEmail,
    }),
    barcode: {
      type: "QR_CODE",
      value: params.barcodeValue,
      ...(params.barcodeAltText !== undefined
        ? { alternateText: params.barcodeAltText }
        : {}),
    },
    loyaltyPoints: {
      label: "Stamps",
      balance: {
        string: `${params.stampCount}/${params.maxPoints}`,
      },
    },
  };
}
