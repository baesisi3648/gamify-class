/**
 * 마니또 배정 규칙.
 * - 자기 자신 배정 금지
 * - 한 사람은 정확히 한 명에게만 배정
 * - 선택 옵션에 따라 2인 맞교환(A→B, B→A) 금지
 */

export function shuffle(values, random = Math.random) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isAllowed(giver, receiver, pairs, preventMutual) {
  if (giver === receiver) return false;
  if (!preventMutual) return true;
  return pairs.get(receiver) !== giver;
}

/**
 * 남은 학생 전체가 규칙을 지키며 배정될 수 있는지 확인한다.
 * 후보가 가장 적은 학생부터 배정해 최대 28명 학급에서도 빠르게 끝난다.
 */
export function findCompletion(givers, receivers, fixedPairs = new Map(), preventMutual = true, random = Math.random) {
  const pairs = new Map(fixedPairs);
  const available = new Set(receivers);

  function visit(remaining) {
    if (remaining.length === 0) return new Map(pairs);

    let selected = null;
    let selectedCandidates = null;
    for (const giver of remaining) {
      const candidates = [...available].filter((receiver) => isAllowed(giver, receiver, pairs, preventMutual));
      if (candidates.length === 0) return null;
      if (!selectedCandidates || candidates.length < selectedCandidates.length) {
        selected = giver;
        selectedCandidates = candidates;
      }
    }

    const nextRemaining = remaining.filter((id) => id !== selected);
    for (const receiver of shuffle(selectedCandidates, random)) {
      pairs.set(selected, receiver);
      available.delete(receiver);
      const solved = visit(nextRemaining);
      if (solved) return solved;
      available.add(receiver);
      pairs.delete(selected);
    }
    return null;
  }

  return visit([...givers]);
}

/** 현재 학생이 고른 카드에 연결할 수 있는 안전한 상대를 선택한다. */
export function chooseReceiver({ giverId, remainingGivers, remainingReceivers, fixedPairs, preventMutual = true, random = Math.random }) {
  const candidates = shuffle(
    remainingReceivers.filter((receiver) => isAllowed(giverId, receiver, fixedPairs, preventMutual)),
    random,
  );

  for (const receiver of candidates) {
    const nextPairs = new Map(fixedPairs);
    nextPairs.set(giverId, receiver);
    const completion = findCompletion(
      remainingGivers.filter((id) => id !== giverId),
      remainingReceivers.filter((id) => id !== receiver),
      nextPairs,
      preventMutual,
      random,
    );
    if (completion) return receiver;
  }
  return null;
}
