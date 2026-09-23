function slotId(slot) {
  return slot?.id || slot?._id;
}

function accountId(acc) {
  return acc?.id || acc?._id;
}

export function moveSlotInAccounts(accounts, sourceSlotId, targetSlotId) {
  if (!sourceSlotId || !targetSlotId || sourceSlotId === targetSlotId) return accounts;

  let sourceCopy = null;
  const cleared = (accounts || []).map((acc) => ({
    ...acc,
    profiles: (acc.profiles || []).map((slot) => {
      if (slotId(slot) !== sourceSlotId) return slot;
      sourceCopy = { ...slot };
      return {
        ...slot,
        clientId: null,
        status: "free",
        memberEmail: "",
        memberPassword: "",
        emailType: "admin",
        pricePen: 0,
        renewalDate: "",
      };
    }),
  }));

  if (!sourceCopy) return accounts;

  return cleared.map((acc) => ({
    ...acc,
    profiles: (acc.profiles || []).map((slot) => {
      if (slotId(slot) !== targetSlotId) return slot;
      return {
        ...slot,
        clientId: sourceCopy.clientId,
        status: "active",
        memberEmail: sourceCopy.memberEmail,
        memberPassword: sourceCopy.memberPassword,
        emailType: sourceCopy.emailType || "client",
        pricePen: sourceCopy.pricePen || 0,
        renewalDate: sourceCopy.renewalDate || "",
      };
    }),
  }));
}

export function findSlotAccount(accounts, id) {
  for (const acc of accounts || []) {
    const slot = (acc.profiles || []).find((p) => slotId(p) === id);
    if (slot) return { account: acc, slot, accountId: accountId(acc) };
  }
  return null;
}
