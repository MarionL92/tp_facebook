// Fonctions utilitaires pour vérifier les droits d'un utilisateur connecté (req.auth.sub)

const toId = (value) => String(value?._id ?? value);

export function uniqueIds(...lists) {
    return [...new Set(lists.flat().filter(Boolean).map(toId))];
}

export function includesUser(list, userId) {
    return Array.isArray(list) && list.some((item) => toId(item) === String(userId));
}

export function isEventOrganizer(event, userId) {
    return includesUser(event.organizers, userId);
}

export function isEventParticipant(event, userId) {
    return isEventOrganizer(event, userId) || includesUser(event.members, userId);
}

export function canViewEvent(event, userId) {
    return event.visibility === 'public' || isEventParticipant(event, userId);
}

export function isGroupAdmin(group, userId) {
    return includesUser(group.admins, userId);
}

export function isGroupMember(group, userId) {
    return isGroupAdmin(group, userId) || includesUser(group.members, userId);
}

export function canViewGroup(group, userId) {
    return group.type !== 'secret' || isGroupMember(group, userId);
}
